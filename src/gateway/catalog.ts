/**
 * Stock catalog pages through the gateway (GET /api/stock/song_category_tree/),
 * as the reference Controller reads them (fiio_http.py catalog/page, catalog.py).
 * Positions in these pages are the stock list positions that playback
 * commands address, unlike data-level IDs.
 */
import type { GatewayHttp } from './http'

export interface CatalogRow {
  /** Track title (or group name for group categories). */
  name: string
  /** Artist credit for track rows. */
  author: string | null
  /** Position field of group rows (custom playlists), when present. */
  pos?: number
}

export interface CatalogPage {
  total: number
  items: CatalogRow[]
  /** mark-pos: the current position in curlist/song (-1 when none). */
  mark: number | null
}

export type Category =
  | 'all/song'
  | 'love/song'
  | 'curlist/song'
  | 'album'
  | 'album/song'
  | 'artist'
  | 'artist/song'
  | 'artist/album/song'
  | 'custom'
  | 'custom/song'

export interface CatalogFilters {
  album?: string
  artist?: string
  /** Playlist position for custom/song (src_list_id). */
  listId?: number
}

const PAGE = 200

/** Named header value as the firmware expects it: percent-encoded UTF-8 that
 * fits its 256-byte buffer, no edge whitespace or control characters. */
export function nameHeader(value: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is rejected
  if (!value || value !== value.trim() || /[\u0000-\u001f]/.test(value)) {
    throw new RangeError('Expected a nonempty name without edge whitespace or control characters')
  }
  const encoded = encodeURIComponent(value)
  if (encoded.length > 255) throw new RangeError('Encoded name exceeds the firmware header buffer (255 bytes)')
  return encoded
}

function row(value: unknown): CatalogRow {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new SyntaxError('Catalog row must be an object')
  const record = value as Record<string, unknown>
  if (typeof record.name !== 'string') throw new SyntaxError('Catalog row needs a name')
  const pos = typeof record.pos === 'number' && Number.isInteger(record.pos) ? record.pos : undefined
  return {
    name: record.name,
    author: typeof record.author === 'string' ? record.author : null,
    ...(pos === undefined ? {} : { pos }),
  }
}

export async function catalogPage(
  http: GatewayHttp,
  category: Category,
  filters: CatalogFilters,
  offset: number,
  limit: number,
): Promise<CatalogPage> {
  const headers: Record<string, string> = { type: category, 'start-pos': String(offset), 'num-max': String(limit) }
  if (filters.album !== undefined) headers.album = nameHeader(filters.album)
  if (filters.artist !== undefined) headers.artist = nameHeader(filters.artist)
  if (filters.listId !== undefined) headers.src_list_id = String(filters.listId)
  const response = await http.stockRead('/song_category_tree/', headers)
  const body = await response.text()
  const items: unknown = body ? JSON.parse(body) : []
  if (!Array.isArray(items)) throw new SyntaxError('Expected a JSON list of catalog rows')
  const total = Number(response.headers.get('total-num'))
  // An empty 200 is not an empty catalog: without total-num there is no page.
  if (!response.headers.has('total-num') || !Number.isInteger(total) || total < 0 || items.length > total) {
    throw new SyntaxError('Catalog returned no valid page')
  }
  const markHeader = response.headers.get('mark-pos')
  const mark = markHeader === null ? null : Number(markHeader)
  if (mark !== null && (!Number.isInteger(mark) || mark < -1 || mark >= Math.max(total, 1))) {
    throw new SyntaxError('Catalog returned an invalid mark')
  }
  return { total, items: items.map(row), mark }
}

/** All rows of a category, bounded. */
export async function catalogRows(
  http: GatewayHttp,
  category: Category,
  filters: CatalogFilters,
  maxRows = 2000,
): Promise<CatalogRow[]> {
  const rows: CatalogRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const page = await catalogPage(http, category, filters, offset, PAGE)
    if (page.total > maxRows) throw new RangeError('Catalog source is larger than the selection bound')
    rows.push(...page.items)
    if (rows.length >= page.total || page.items.length === 0) {
      if (rows.length !== page.total) throw new SyntaxError('Catalog pages disagree with their total')
      return rows
    }
  }
}

export function sameRows(a: readonly CatalogRow[], b: readonly CatalogRow[]): boolean {
  return (
    a.length === b.length &&
    a.every((item, index) => {
      const other = b[index]
      return other !== undefined && item.name === other.name && item.author === other.author && item.pos === other.pos
    })
  )
}
