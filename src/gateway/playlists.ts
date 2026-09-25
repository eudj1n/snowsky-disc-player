/**
 * Guarded playlist editing, after the reference Controller
 * (playlist_operations.edit, fiio_http.py create/rename/add/remove):
 *
 * 1. Read the stock `custom` lists twice; they must be equal. A playlist is
 *    addressed by the position of the one row with its exact name.
 * 2. Resolve members and sources from equal double reads; tracks match by
 *    exact title and artist, and an ambiguous match is refused.
 * 3. Re-read everything once more immediately before the single write.
 * 4. Send one mutation with the token and a fresh request ID. HTTP 200 is only
 *    "sent"; the gateway's own refusals (4xx, 503) mean "not sent".
 * 5. Confirm by reading back: the list names (create, rename, delete) or the
 *    member multiset (add, remove). Anything else is `uncertain`; nothing is
 *    retried.
 *
 * Adding always uses the whole library (`all/song`) as the source, so any
 * track from any view can be added by its unique position there; several
 * tracks become ordered, non-overlapping ranges. Deleting a playlist is not in
 * the reference session: it follows the same pattern and needs emulator
 * acceptance before release.
 */
import { catalogRows, nameHeader, sameRows, type CatalogFilters, type CatalogRow, type Category } from './catalog'
import type { GatewayHttp } from './http'
import type { TrackKey } from './selection'

export type EditOutcome =
  'confirmed' | 'already' | 'invalid' | 'exists' | 'duplicate' | 'changed' | 'ambiguous' | 'not-sent' | 'uncertain'

export interface EditDeps {
  http: GatewayHttp
  token: string
  /** Throws when scan activity was observed (checked right before the write). */
  guard?: () => void
  /** Marks the single write attempt, right before it. */
  attempted?: () => void
}

class Changed extends Error {}
class Refused extends Error {
  constructor(readonly outcome: EditOutcome) {
    super(outcome)
  }
}

const MAX_ROWS = 10_000
/** The reference range body bound. */
const MAX_RANGES = 100

async function stable(http: GatewayHttp, category: Category, filters: CatalogFilters = {}): Promise<CatalogRow[]> {
  const first = await catalogRows(http, category, filters, MAX_ROWS)
  const second = await catalogRows(http, category, filters, MAX_ROWS)
  if (!sameRows(first, second)) throw new Changed('source changed between reads')
  return first
}

/** The stock position of the one playlist with this exact name. */
function positionOf(lists: readonly CatalogRow[], name: string): number {
  const matches = lists.flatMap((row, index) => (row.name === name ? [row.pos ?? index] : []))
  if (matches.length !== 1 || matches[0] === undefined) throw new Refused(matches.length ? 'ambiguous' : 'changed')
  return matches[0]
}

const key = (row: { name: string; author: string | null }) => JSON.stringify([row.name, row.author])
const names = (rows: readonly CatalogRow[]) => rows.map((row) => row.name).sort()
const identities = (rows: readonly { name: string; author: string | null }[]) => rows.map(key).sort()
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i])
const placements = (rows: readonly CatalogRow[]) => rows.map((row, index) => `${String(row.pos ?? index)}:${row.name}`)

/** Sorted positions as inclusive ranges: [1,2,3,7] → [[1,3],[7,7]]. */
export function toRanges(positions: readonly number[]): [number, number][] {
  const sorted = [...new Set(positions)].sort((a, b) => a - b)
  const ranges: [number, number][] = []
  for (const position of sorted) {
    const last = ranges.at(-1)
    if (last && position === last[1] + 1) last[1] = position
    else ranges.push([position, position])
  }
  return ranges
}

/** The one position of a track in rows, by exact title and artist. */
function find(rows: readonly CatalogRow[], track: TrackKey): number {
  const matches = rows.flatMap((row, index) => (row.name === track.title && row.author === track.artist ? [index] : []))
  if (matches.length !== 1 || matches[0] === undefined) throw new Refused(matches.length ? 'ambiguous' : 'changed')
  return matches[0]
}

/** Classifies the gateway's reply to a stock mutation. */
function sentOrNot(status: number): 'sent' | 'not-sent' | 'uncertain' {
  if (status >= 200 && status < 300) return 'sent'
  if ([400, 403, 405, 409, 413, 414, 503].includes(status)) return 'not-sent'
  return 'uncertain'
}

interface Write {
  route: string
  method: 'POST' | 'DELETE'
  headers: Record<string, string>
  body?: string
}

async function send(deps: EditDeps, write: Write): Promise<'sent' | 'not-sent' | 'uncertain'> {
  try {
    deps.guard?.()
  } catch {
    return 'not-sent'
  }
  deps.attempted?.()
  try {
    const { response } = await deps.http.stockMutation(write.route, {
      method: write.method,
      token: deps.token,
      headers: write.body === undefined ? write.headers : { ...write.headers, 'Content-Type': 'application/json' },
      ...(write.body === undefined ? {} : { body: write.body }),
    })
    return sentOrNot(response.status)
  } catch {
    return 'uncertain'
  }
}

/** Runs preflight, one write and a readback; maps failures to outcomes. */
async function edit(
  deps: EditDeps,
  prepare: () => Promise<{ write: Write; recheck: () => Promise<void>; confirm: () => Promise<boolean> } | EditOutcome>,
): Promise<EditOutcome> {
  let prepared: Awaited<ReturnType<typeof prepare>>
  try {
    prepared = await prepare()
    if (typeof prepared === 'string') return prepared
    await prepared.recheck()
  } catch (error) {
    if (error instanceof Refused) return error.outcome
    if (error instanceof RangeError) return 'invalid'
    return 'changed'
  }
  const sent = await send(deps, prepared.write)
  if (sent !== 'sent') return sent
  try {
    return (await prepared.confirm()) ? 'confirmed' : 'uncertain'
  } catch {
    return 'uncertain'
  }
}

export function createPlaylist(deps: EditDeps, name: string): Promise<EditOutcome> {
  return edit(deps, async () => {
    const header = nameHeader(name)
    const lists = await stable(deps.http, 'custom')
    if (lists.some((row) => row.name === name)) return 'exists'
    const expected = [...names(lists), name].sort()
    return {
      write: { route: '/custom_list_cmd/', method: 'POST', headers: { type: 'create', list_name: header } },
      recheck: async () => {
        if (!sameRows(await catalogRows(deps.http, 'custom', {}, MAX_ROWS), lists)) throw new Changed()
      },
      confirm: async () => same(names(await stable(deps.http, 'custom')), expected),
    }
  })
}

export function renamePlaylist(deps: EditDeps, name: string, next: string): Promise<EditOutcome> {
  return edit(deps, async () => {
    const header = nameHeader(next)
    const lists = await stable(deps.http, 'custom')
    const position = positionOf(lists, name)
    if (name === next) return 'already'
    if (lists.some((row) => row.name === next)) return 'exists'
    const expected = lists.map((row) => (row.name === name ? next : row.name)).sort()
    return {
      write: {
        route: '/custom_list_cmd/',
        method: 'POST',
        headers: { type: 'update', list_id: String(position), list_name: header },
      },
      recheck: async () => {
        if (!sameRows(await catalogRows(deps.http, 'custom', {}, MAX_ROWS), lists)) throw new Changed()
      },
      confirm: async () => same(names(await stable(deps.http, 'custom')), expected),
    }
  })
}

/** Removes the list only (delete_source 0: files stay); later lists move up one position. */
export function deletePlaylist(deps: EditDeps, name: string): Promise<EditOutcome> {
  return edit(deps, async () => {
    const lists = await stable(deps.http, 'custom')
    const position = positionOf(lists, name)
    const expected = lists.filter((row) => row.name !== name).map((row) => row.name)
    return {
      write: {
        route: '/song_category_tree/',
        method: 'DELETE',
        headers: { type: 'custom', delete_source: '0' },
        body: JSON.stringify([[position, position]]),
      },
      recheck: async () => {
        if (!sameRows(await catalogRows(deps.http, 'custom', {}, MAX_ROWS), lists)) throw new Changed()
      },
      confirm: async () => {
        const after = await stable(deps.http, 'custom')
        return same(
          after.map((row) => row.name),
          expected,
        )
      },
    }
  })
}

/** Adds library tracks to a playlist; refuses tracks already in it. */
export function addTracks(deps: EditDeps, playlist: string, tracks: readonly TrackKey[]): Promise<EditOutcome> {
  return edit(deps, async () => {
    if (!tracks.length) return 'invalid'
    nameHeader(playlist)
    const lists = await stable(deps.http, 'custom')
    const position = positionOf(lists, playlist)
    const members = await stable(deps.http, 'custom/song', { listId: position })
    const source = await stable(deps.http, 'all/song')
    const picked = tracks.map((track) => find(source, track))
    const memberKeys = new Set(members.map(key))
    if (picked.some((index) => memberKeys.has(key(source[index] ?? { name: '', author: null })))) return 'duplicate'
    const ranges = toRanges(picked)
    if (ranges.length > MAX_RANGES) return 'invalid'
    const wanted = identities([...members, ...picked.map((index) => source[index] ?? { name: '', author: null })])
    return {
      write: {
        route: '/add_custom_list/',
        method: 'POST',
        headers: { type: 'all/song', dst_list_id: String(position) },
        body: JSON.stringify(ranges),
      },
      recheck: async () => {
        if (!sameRows(await catalogRows(deps.http, 'custom', {}, MAX_ROWS), lists)) throw new Changed()
        if (!sameRows(await catalogRows(deps.http, 'custom/song', { listId: position }, MAX_ROWS), members))
          throw new Changed()
        if (!sameRows(await catalogRows(deps.http, 'all/song', {}, MAX_ROWS), source)) throw new Changed()
      },
      confirm: async () => {
        const after = await stable(deps.http, 'custom')
        if (!same(placements(after), placements(lists))) return false
        return same(identities(await stable(deps.http, 'custom/song', { listId: position })), wanted)
      },
    }
  })
}

/**
 * Removes one track from the built-in favorites (`love/song`, delete_source 0:
 * the file stays). Needs a catalog that admits it (service combined-006).
 */
export function removeFavorite(deps: EditDeps, track: TrackKey): Promise<EditOutcome> {
  return edit(deps, async () => {
    const members = await stable(deps.http, 'love/song')
    const index = find(members, track)
    const wanted = identities(members.filter((_, i) => i !== index))
    return {
      write: {
        route: '/song_category_tree/',
        method: 'DELETE',
        headers: { type: 'love/song', delete_source: '0' },
        body: JSON.stringify([[index, index]]),
      },
      recheck: async () => {
        if (!sameRows(await catalogRows(deps.http, 'love/song', {}, MAX_ROWS), members)) throw new Changed()
      },
      confirm: async () => same(identities(await stable(deps.http, 'love/song')), wanted),
    }
  })
}

/** Removes one track from a playlist; the file stays on the card. */
export function removeTrack(deps: EditDeps, playlist: string, track: TrackKey): Promise<EditOutcome> {
  return edit(deps, async () => {
    nameHeader(playlist)
    const lists = await stable(deps.http, 'custom')
    const position = positionOf(lists, playlist)
    const members = await stable(deps.http, 'custom/song', { listId: position })
    const index = find(members, track)
    const wanted = identities(members.filter((_, i) => i !== index))
    return {
      write: {
        route: '/song_category_tree/',
        method: 'DELETE',
        headers: { type: 'custom/song', src_list_id: String(position), delete_source: '0' },
        body: JSON.stringify([[index, index]]),
      },
      recheck: async () => {
        if (!sameRows(await catalogRows(deps.http, 'custom', {}, MAX_ROWS), lists)) throw new Changed()
        if (!sameRows(await catalogRows(deps.http, 'custom/song', { listId: position }, MAX_ROWS), members))
          throw new Changed()
      },
      confirm: async () => {
        const after = await stable(deps.http, 'custom')
        if (!same(placements(after), placements(lists))) return false
        return same(identities(await stable(deps.http, 'custom/song', { listId: position })), wanted)
      },
    }
  })
}
