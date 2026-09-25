/** HTTP surface of the gateway: health, the read-only data level and the
 * catalog-driven stock proxy. Same origin only; the gateway has no CORS. */
import { requestId as newRequestId } from './ids'

export interface Health {
  service: string
  api: number
  controlActive: boolean
  readOnly: boolean
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

export class GatewayHttp {
  constructor(private readonly fetchImpl: Fetch = (input, init) => fetch(input, init)) {}

  async health(): Promise<Health> {
    const value = await this.json<Health>('/api/health')
    if (value.api !== 1) throw new HttpError(200, `Unsupported gateway api ${String(value.api)}`)
    return value
  }

  /** Runs one reviewed read-only query (see queries.json in the release). */
  data(query: string, params: Record<string, string | number> = {}): Promise<DataResult> {
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(query)) throw new RangeError(`Invalid query name: ${query}`)
    const search = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
    return this.json<DataResult>(`/api/data/${query}${search ? `?${search}` : ''}`)
  }

  /** A stock read through /api/stock/<route>. Route segments are plain text and
   * are percent-encoded here; stock takes its parameters in headers. */
  async stockRead(route: string, headers: Record<string, string> = {}): Promise<Response> {
    const response = await this.fetchImpl(stockUrl(route), { headers, cache: 'no-store' })
    if (!response.ok) throw new HttpError(response.status, (await response.text()).trim())
    return response
  }

  /** A stock mutation with the pairing token and a fresh request ID. HTTP 200
   * is not a device confirmation; callers read back the resulting state and
   * never retry an uncertain outcome. */
  async stockMutation(
    route: string,
    init: { method: 'POST' | 'DELETE'; token: string; headers?: Record<string, string>; body?: BodyInit },
  ): Promise<{ requestId: string; response: Response }> {
    const id = newRequestId()
    const response = await this.fetchImpl(stockUrl(route), {
      method: init.method,
      headers: { ...init.headers, 'X-Disc-Token': init.token, 'X-Disc-Request': id },
      ...(init.body === undefined ? {} : { body: init.body }),
      cache: 'no-store',
    })
    return { requestId: id, response }
  }

  private async json<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(path, { cache: 'no-store' })
    if (!response.ok) throw new HttpError(response.status, (await response.text()).trim())
    return (await response.json()) as T
  }
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
