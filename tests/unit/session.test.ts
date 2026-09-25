import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeRecord } from '../../src/gateway/record'
import { Disconnected, GatewaySession, NoObservation, type SocketLike } from '../../src/gateway/session'

type Listener = (event: never) => void

/** A scripted WebSocket: `replies` maps a sent record to the records the player answers with. */
class FakeSocket implements SocketLike {
  readyState = 0
  sent: string[] = []
  closedWith: number | null = null
  private listeners = new Map<string, Listener[]>()
  constructor(private replies: Record<string, string[]> = {}) {}
  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  emit(type: string, event: unknown = {}): void {
    for (const listener of this.listeners.get(type) ?? []) (listener as (e: unknown) => void)(event)
  }
  open(): void {
    this.readyState = 1
    this.emit('open')
  }
  send(data: string): void {
    this.sent.push(data)
    for (const reply of this.replies[data] ?? []) queueMicrotask(() => this.emit('message', { data: reply }))
  }
  close(code = 1000): void {
    if (this.readyState === 3) return
    this.readyState = 3
    this.closedWith = code
    this.emit('close', { code })
  }
  serverClose(code: number): void {
    this.readyState = 3
    this.emit('close', { code })
  }
}

const HANDSHAKE = { '0599000C0000': [encodeRecord('a599', '0306')] }

async function openSession(replies: Record<string, string[]> = {}) {
  const socket = new FakeSocket({ ...HANDSHAKE, ...replies })
  const opening = GatewaySession.open('ws://player/api/websocket', () => {
    queueMicrotask(() => socket.open())
    return socket
  })
  const { session, identity } = await opening
  return { socket, session, identity }
}

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(() => vi.useRealTimers())

describe('gateway session', () => {
  it('performs the identity handshake first', async () => {
    const { socket, identity } = await openSession()
    expect(identity).toBe('0306')
    expect(socket.sent[0]).toBe('0599000C0000')
  })

  it('serializes reads and matches replies by expected tag', async () => {
    const { session, socket } = await openSession({
      '05010008': [encodeRecord('a202', '{}'), encodeRecord('a501', '{"soc_version":257}')],
      '02020008': [encodeRecord('a202', '{"state":1}')],
    })
    const [settings, playback] = await Promise.all([session.read('0501', 'a501'), session.read('0202', 'a202')])
    expect(settings).toBe('{"soc_version":257}')
    expect(playback).toBe('{"state":1}')
    expect(socket.sent.slice(1)).toEqual(['05010008', '02020008'])
  })

  it('keeps the connection when an a202 read is unanswered', async () => {
    const { session, socket } = await openSession()
    const read = session.read('0202', 'a202', '', 4000)
    const assertion = expect(read).rejects.toBeInstanceOf(NoObservation)
    await vi.advanceTimersByTimeAsync(4000)
    await assertion
    expect(session.open).toBe(true)
    expect(socket.closedWith).toBeNull()
  })

  it('retires the connection when any other read is unanswered', async () => {
    const { session, socket } = await openSession()
    const read = session.read('0501', 'a501', '', 4000)
    const assertion = expect(read).rejects.toBeInstanceOf(Disconnected)
    await vi.advanceTimersByTimeAsync(4000)
    await assertion
    expect(session.open).toBe(false)
    expect(socket.closedWith).toBe(1000)
  })

  it('refuses mutations before pairing and sends token, request ID and record in order', async () => {
    const { session, socket } = await openSession({ '0201000C0000': [encodeRecord('a202', '{"state":0}')] })
    expect(await session.mutate('0201', '0000', 'a202')).toEqual({ status: 'unsent', reason: 'not paired' })
    session.pair('t'.repeat(43))
    const outcome = await session.mutate('0201', '0000', 'a202')
    expect(outcome.status).toBe('replied')
    const tail = socket.sent.slice(-3)
    expect(tail[0]).toBe(`token:${'t'.repeat(43)}`)
    expect(tail[1]).toMatch(/^request:[A-Za-z0-9_-]{32}$/)
    expect(tail[2]).toBe('0201000C0000')
    const second = await session.mutate('0201', '0000', 'a202')
    expect(second.status === 'replied' && outcome.status === 'replied' && second.requestId !== outcome.requestId).toBe(
      true,
    )
  })

  it('reports an unanswered mutation as uncertain and never resends it', async () => {
    const { session, socket } = await openSession()
    session.pair('t'.repeat(43))
    const mutation = session.mutate('0201', '0000', 'a202', 4000)
    await vi.advanceTimersByTimeAsync(4000)
    expect(await mutation).toMatchObject({ status: 'uncertain', reason: 'timeout' })
    expect(socket.sent.filter((record) => record === '0201000C0000')).toHaveLength(1)
  })

  it('maps gateway close codes to reasons and fails pending requests', async () => {
    const { session, socket } = await openSession()
    const reasons: string[] = []
    session.onClose((reason) => reasons.push(reason))
    const read = session.read('0501', 'a501')
    const assertion = expect(read).rejects.toMatchObject({ reason: 'not-admitted' })
    socket.serverClose(1008)
    await assertion
    expect(reasons).toEqual(['not-admitted'])
    await expect(session.read('0202', 'a202')).rejects.toBeInstanceOf(Disconnected)
  })

  it('retires on a malformed record', async () => {
    const { session, socket } = await openSession()
    socket.emit('message', { data: 'a202FFFF' })
    expect(session.open).toBe(false)
  })

  it('rejects malformed pairing tokens', async () => {
    const { session } = await openSession()
    expect(() => session.pair('short')).toThrow(RangeError)
    expect(session.isPaired).toBe(false)
  })
})
