/** HTTP surface of the gateway: health, the read-only data level and the
 * catalog-driven stock proxy. Same origin only; the gateway has no CORS. */
import { requestId as newRequestId } from './ids'

export interface Health {
  service: string
  api: number
  controlActive: boolean
  readOnly: boolean
  /** The gateway serves /api/media (service combined-006 and later). */
  media?: boolean
  /** The card enables pairing with the player's serial number (combined-006). */
  snPairing?: boolean
}

export interface DataResult {
  query: string
  columns: string[]
  rows: unknown[][]
  rows_returned: number
  truncated: boolean
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(`HTTP ${status}: ${message}`)
  }
}

export type Fetch = typeof fetch

/** Pauses before retrying a read the gateway answered 503 (database busy, stock reservation taken). */
const BUSY_RETRIES_MS = [400, 900]

export class GatewayHttp {
  /** The gateway holds one stock HTTP reservation: stock requests from this page go one at a time. */
  private stockLane: Promise<unknown> = Promise.resolve()
  /** The gateway runs at most two media reads at a time; the rest wait here. */
  private mediaActive = 0
  private readonly mediaWaiting: (() => void)[] = []

  constructor(
    private readonly fetchImpl: Fetch = (input, init) => fetch(input, init),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms)),
  ) {}

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.stockLane.then(task, task)
    this.stockLane = run.catch(() => undefined)
    return run
  }

  /** Reads are safe to repeat: a 503 (busy) gets two more tries. Mutations never come here. */
  private async retryBusy<T>(task: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await task()
      } catch (error) {
        const pause = BUSY_RETRIES_MS[attempt]
        if (!(error instanceof HttpError) || error.status !== 503 || pause === undefined) throw error
        await this.sleep(pause)
      }
    }
  }

  async health(): Promise<Health> {
    const value = await this.json<Health>('/api/health')
    if (value.api !== 1) throw new HttpError(200, `Unsupported gateway api ${String(value.api)}`)
    return value
  }

  /** Runs one reviewed read-only query (see queries.json in the release). */
  data(query: string, params: Record<string, string | number> = {}): Promise<DataResult> {
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(query)) throw new RangeError(`Invalid query name: ${query}`)
    const search = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
    return this.retryBusy(() => this.json<DataResult>(`/api/data/${query}${search ? `?${search}` : ''}`))
  }

  /**
   * One media read (/api/media/<route>), at most two at a time, repeated after
   * a busy 503. A missing file (404), a refused path (403) and a file without
   * the cover or lyrics asked for (204) are null.
   */
  async media(route: string): Promise<Response | null> {
    while (this.mediaActive >= 2) await new Promise<void>((resume) => this.mediaWaiting.push(resume))
    this.mediaActive++
    try {
      return await this.retryBusy(async () => {
        const response = await this.fetchImpl(`/api/media${route}`, { cache: 'default' })
        if (response.status === 404 || response.status === 403 || response.status === 204) return null
        if (!response.ok) throw new HttpError(response.status, (await response.text()).trim())
        return buffered(response)
      })
    } finally {
      this.mediaActive--
      this.mediaWaiting.shift()?.()
    }
  }

  /** A stock read through /api/stock/<route>. Route segments are plain text and
   * are percent-encoded here; stock takes its parameters in headers. */
  stockRead(route: string, headers: Record<string, string> = {}): Promise<Response> {
    return this.exclusive(() =>
      this.retryBusy(async () => {
        const response = await this.fetchImpl(stockUrl(route), { headers, cache: 'no-store' })
        if (!response.ok) throw new HttpError(response.status, (await response.text()).trim())
        // The body is read inside the reservation, so the next request starts after it.
        return buffered(response)
      }),
    )
  }

  /** A stock mutation with the pairing token and a fresh request ID. HTTP 200
   * is not a device confirmation; callers read back the resulting state and
   * never retry an uncertain outcome. */
  stockMutation(
    route: string,
    init: { method: 'POST' | 'DELETE'; token: string; headers?: Record<string, string>; body?: BodyInit },
  ): Promise<{ requestId: string; response: Response }> {
    const id = newRequestId()
    return this.exclusive(async () => {
      const response = await this.fetchImpl(stockUrl(route), {
        method: init.method,
        headers: { ...init.headers, 'X-Disc-Token': init.token, 'X-Disc-Request': id },
        ...(init.body === undefined ? {} : { body: init.body }),
        cache: 'no-store',
      })
      return { requestId: id, response: await buffered(response) }
    })
  }

  private async json<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(path, { cache: 'no-store' })
    if (!response.ok) throw new HttpError(response.status, (await response.text()).trim())
    return (await response.json()) as T
  }
}

/** A copy of the response with its body read, for use after the reservation ends. */
async function buffered(response: Response): Promise<Response> {
  const empty = [101, 103, 204, 205, 304].includes(response.status)
  const body = empty ? null : await response.arrayBuffer()
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
}

function stockUrl(route: string): string {
  if (!route.startsWith('/') || route.includes('?') || route.includes('//'))
    throw new RangeError(`Invalid stock route: ${route}`)
  return `/api/stock${route
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')}`
}

/** Rows of a data result as objects keyed by column name. */
export function rowsOf(result: DataResult): Record<string, unknown>[] {
  return result.rows.map((row) => Object.fromEntries(result.columns.map((column, i) => [column, row[i]])))
}
