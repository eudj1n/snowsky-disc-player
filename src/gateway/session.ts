/**
 * One owner session over the gateway WebSocket (`/api/websocket`).
 *
 * Client obligations from the gateway contract, unchanged from the reference
 * Controller: serialize requests and match replies by expected tag; an
 * unanswered a202 read is an unknown observation and keeps the connection;
 * any other unanswered request retires the connection, because FiiO records
 * carry no request IDs and a late reply could answer a newer request; never
 * replay a mutation whose outcome is uncertain; never reconnect implicitly.
 */
import { decodeRecord, encodeRecord, type DiscRecord } from './record'
import { requestId as newRequestId } from './ids'
import { SERIAL } from '../domain/pairing'

export type CloseReason =
  | 'client'
  | 'framing'
  | 'malformed'
  | 'not-admitted'
  | 'credential'
  | 'oversize'
  | 'stock-ended'
  | 'scanning'
  | 'network'

const CLOSE_REASONS: Record<number, CloseReason> = {
  1000: 'client',
  1002: 'framing',
  1007: 'malformed',
  1008: 'not-admitted',
  1009: 'oversize',
  1011: 'stock-ended',
  // Try again later: the gateway refused a mutation while stock scans the library.
  1013: 'scanning',
}

export function closeReason(code: number): CloseReason {
  return CLOSE_REASONS[code] ?? 'network'
}

/** The subset of WebSocket the session needs; tests supply a fake. */
export interface SocketLike {
  readonly readyState: number
  send(data: string): void
  close(code?: number): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
  addEventListener(type: 'close', listener: (event: { code: number }) => void): void
  addEventListener(type: 'open' | 'error', listener: () => void): void
}

export type SocketFactory = (url: string) => SocketLike

export class Disconnected extends Error {
  constructor(readonly reason: CloseReason) {
    super(`Disconnected (${reason})`)
  }
}
/** An a202 read without an answer: the state is unknown, the session stays open. */
export class NoObservation extends Error {}

export type MutationOutcome =
  | { status: 'replied'; requestId: string; reply: DiscRecord }
  | { status: 'sent'; requestId: string }
  | { status: 'uncertain'; requestId: string; reason: 'timeout' | CloseReason }
  | { status: 'unsent'; reason: string }

interface Pending {
  expected: string
  /** Sent after the credential: its reply proves the gateway accepted it. */
  afterCredential: boolean
  resolve(record: DiscRecord): void
  reject(error: Error): void
  timer: ReturnType<typeof setTimeout>
}

const OPEN = 1
const MAX_QUEUE = 32

export class GatewaySession {
  private pending: Pending | null = null
  private lane: Promise<unknown> = Promise.resolve()
  private queued = 0
  private closedReason: CloseReason | null = null
  private paired = false
  /** From pair() until a request sent after the credential is answered. */
  private credentialUnconfirmed = false
  private readonly recordListeners = new Set<(record: DiscRecord) => void>()
  private readonly closeListeners = new Set<(reason: CloseReason) => void>()

  private constructor(private readonly socket: SocketLike) {
    socket.addEventListener('message', (event) => this.receive(event.data))
    socket.addEventListener('close', (event) => this.finish(closeReason(event.code)))
  }

  /** Opens the WebSocket, then performs the mandatory 0599 identity handshake. */
  static async open(
    url: string,
    factory: SocketFactory = (u) => new WebSocket(u),
    timeoutMs = 5000,
  ): Promise<{ session: GatewaySession; identity: string }> {
    const socket = factory(url)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.close()
        reject(new Disconnected('network'))
      }, timeoutMs)
      socket.addEventListener('open', () => {
        clearTimeout(timer)
        resolve()
      })
      socket.addEventListener('close', (event) => {
        clearTimeout(timer)
        reject(new Disconnected(closeReason(event.code)))
      })
    })
    const session = new GatewaySession(socket)
    const identity = await session.read('0599', 'a599', '0000')
    return { session, identity }
  }

  get open(): boolean {
    return this.closedReason === null && this.socket.readyState === OPEN
  }

  onRecord(listener: (record: DiscRecord) => void): () => void {
    this.recordListeners.add(listener)
    return () => this.recordListeners.delete(listener)
  }

  onClose(listener: (reason: CloseReason) => void): () => void {
    this.closeListeners.add(listener)
    return () => this.closeListeners.delete(listener)
  }

  /** Sends the card pairing token (or the player's serial number, where the
   * card allows it) once per session; mutations need it. The gateway does not
   * acknowledge it: it handles frames in order and closes with 1008 at a wrong
   * credential, so a 1008 before any later request is answered closes the
   * session as 'credential'. */
  pair(token: string): void {
    if (!SERIAL.test(token)) throw new RangeError('Pairing needs the player serial number')
    this.assertOpen()
    this.socket.send(`token:${token}`)
    this.paired = true
    this.credentialUnconfirmed = true
  }

  get isPaired(): boolean {
    return this.paired
  }

  /** One serialized read; resolves with the reply payload. */
  read(tag: string, expected: string, payload = '', timeoutMs = 4000): Promise<string> {
    return this.enqueue(async () => (await this.exchange(tag, payload, expected, timeoutMs)).payload)
  }

  /**
   * One mutation with a fresh request ID. The outcome is what was observed,
   * not a confirmation of the device operation: callers confirm with a fresh
   * read. An uncertain outcome must never be retried automatically.
   */
  mutate(tag: string, payload: string, expected: string | null, timeoutMs = 4000): Promise<MutationOutcome> {
    return this.enqueue(async (): Promise<MutationOutcome> => {
      if (!this.paired) return { status: 'unsent', reason: 'not paired' }
      if (!this.open) return { status: 'unsent', reason: 'disconnected' }
      const id = newRequestId()
      try {
        this.socket.send(`request:${id}`)
        if (expected === null) {
          this.socket.send(encodeRecord(tag, payload))
          return { status: 'sent', requestId: id }
        }
        const reply = await this.exchange(tag, payload, expected, timeoutMs)
        return { status: 'replied', requestId: id, reply }
      } catch (error) {
        const reason = error instanceof Disconnected ? error.reason : 'timeout'
        return { status: 'uncertain', requestId: id, reason }
      }
    })
  }

  close(): void {
    if (this.closedReason === null) {
      this.socket.close(1000)
      this.finish('client')
    }
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    if (this.queued >= MAX_QUEUE) return Promise.reject(new Error('Too many queued requests'))
    this.queued++
    const run = this.lane.then(() => {
      this.assertOpen()
      return task()
    })
    this.lane = run
      .catch(() => undefined)
      .finally(() => {
        this.queued--
      })
    return run
  }

  private exchange(tag: string, payload: string, expected: string, timeoutMs: number): Promise<DiscRecord> {
    this.assertOpen()
    const record = encodeRecord(tag, payload)
    return new Promise<DiscRecord>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null
        if (expected === 'a202') {
          reject(new NoObservation('No a202 observation'))
        } else {
          reject(new Disconnected('network'))
          this.retire()
        }
      }, timeoutMs)
      this.pending = { expected, afterCredential: this.paired, resolve, reject, timer }
      this.socket.send(record)
    })
  }

  private receive(data: unknown): void {
    if (this.closedReason !== null) return
    if (typeof data !== 'string') {
      this.retire()
      return
    }
    let record: DiscRecord
    try {
      record = decodeRecord(data)
    } catch {
      this.retire()
      return
    }
    const pending = this.pending
    if (pending && pending.expected === record.tag) {
      this.pending = null
      clearTimeout(pending.timer)
      if (pending.afterCredential) this.credentialUnconfirmed = false
      pending.resolve(record)
    }
    for (const listener of this.recordListeners) listener(record)
  }

  private retire(): void {
    if (this.closedReason === null) {
      this.socket.close(1000)
      this.finish('network')
    }
  }

  private finish(closed: CloseReason): void {
    if (this.closedReason !== null) return
    const reason = closed === 'not-admitted' && this.credentialUnconfirmed ? 'credential' : closed
    this.closedReason = reason
    if (this.pending) {
      clearTimeout(this.pending.timer)
      this.pending.reject(new Disconnected(reason))
      this.pending = null
    }
    for (const listener of this.closeListeners) listener(reason)
  }

  private assertOpen(): void {
    if (this.closedReason !== null) throw new Disconnected(this.closedReason)
    if (this.socket.readyState !== OPEN) throw new Disconnected('network')
  }
}
