/**
 * Guarded playback selection, after the reference Controller (session.py
 * play_album, source_playback.py select, link_commands.py
 * play_catalog_track, playback.py GuardedHTTP and verify_playing):
 *
 * 1. Read the source's stock membership twice; it must be non-empty and equal.
 * 2. Resolve the target position in that stock order (a track must match by
 *    title and artist exactly once; data-level IDs are never positions).
 * 3. Immediately before sending, re-read the target row and the total.
 * 4. Send one selection with a fresh request ID:
 *    whole album `0101 0003<album>`, album track `0100 <pos> 0003<album>`,
 *    one artist's album `0101 0007{"artist":"A", "album":"B"}` (or `0100
 *    <pos> 0007…`), library track `0100 <pos> 0001`, favorite `0100 <pos> 0006`.
 * 5. Confirm with fresh reads: playing, the expected source, and the exact
 *    target (or, for a whole album, a member of it).
 *
 * Anything else is `uncertain`; the selection is never retried.
 */
import { catalogPage, catalogRows, sameRows, type CatalogFilters, type CatalogRow, type Category } from './catalog'
import type { GatewayHttp } from './http'
import type { PlaybackSource } from '../domain/playback'
import { parsePlayback } from './playback'
import { NoObservation, type GatewaySession } from './session'

export type SelectionOutcome = 'playing' | 'uncertain' | 'changed' | 'ambiguous' | 'unavailable'

/** What to play: a source and, optionally, one track in it. */
export type SelectionTarget =
  | { kind: 'album'; album: string; track?: TrackKey }
  /** One literal track artist's part of an album title: separates releases sharing a title. */
  | { kind: 'artistAlbum'; artist: string; album: string; track?: TrackKey }
  | { kind: 'library'; track: TrackKey }
  | { kind: 'favorites'; track: TrackKey }
  | { kind: 'playlist'; name: string; track?: TrackKey }

export interface TrackKey {
  title: string
  artist: string | null
}

export interface SelectionDeps {
  session: GatewaySession
  http: GatewayHttp
  /** Command timeout from commands.json. */
  timeoutMs: number
  /** Throws when scan activity was observed (checked right before the send). */
  guard?: () => void
  /** Marks the single mutation attempt right before the send. */
  attempted?: () => void
  confirmMs?: number
  pauseMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

const SOURCES: Record<SelectionTarget['kind'], { category: Category; list: string; source: PlaybackSource }> = {
  album: { category: 'album/song', list: '0003', source: 'album' },
  artistAlbum: { category: 'artist/album/song', list: '0007', source: 'artistAlbum' },
  library: { category: 'all/song', list: '0001', source: 'library' },
  favorites: { category: 'love/song', list: '0006', source: 'favorites' },
  playlist: { category: 'custom/song', list: '0005', source: 'playlist' },
}

/** The playlist's position in the stock `custom` order, found by its unique name. */
async function playlistPosition(
  http: GatewayHttp,
  name: string,
): Promise<{ position: number; lists: CatalogRow[] } | 'ambiguous'> {
  const lists = await catalogRows(http, 'custom', {}, 1000)
  const again = await catalogRows(http, 'custom', {}, 1000)
  if (!sameRows(lists, again)) throw new Error('Playlist positions are changing')
  const matches = lists.filter((row) => row.name === name)
  const match = matches[0]
  if (matches.length !== 1 || match?.pos === undefined) return 'ambiguous'
  return { position: match.pos, lists }
}

const hex4 = (value: number) => value.toString(16).toUpperCase().padStart(4, '0')

/**
 * The stock parses the type-7 selector with sscanf, not JSON: key order and
 * the space after the comma matter, and quotes or backslashes cannot be
 * escaped. Reserved "unknown" tokens select nothing real (reference
 * fiio_library.artist_command).
 */
export function artistAlbumSelector(artist: string, album: string): string | null {
  if (artist === 'unknown_artist' || album === 'unknown_album' || /["\\]/.test(artist + album)) return null
  return `{"artist":"${artist}", "album":"${album}"}`
}

function resolve(rows: readonly CatalogRow[], track: TrackKey): number | 'ambiguous' | 'missing' {
  const matches = rows.flatMap((row, index) => (row.name === track.title && row.author === track.artist ? [index] : []))
  if (!matches.length) return 'missing'
  return matches.length === 1 && matches[0] !== undefined ? matches[0] : 'ambiguous'
}

export async function selectSource(deps: SelectionDeps, target: SelectionTarget): Promise<SelectionOutcome> {
  const { session, http, timeoutMs } = deps
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)))
  const spec = SOURCES[target.kind]
  let filters: CatalogFilters =
    target.kind === 'album'
      ? { album: target.album }
      : target.kind === 'artistAlbum'
        ? { artist: target.artist, album: target.album }
        : {}
  const selector = target.kind === 'artistAlbum' ? artistAlbumSelector(target.artist, target.album) : null
  if (target.kind === 'artistAlbum' && selector === null) return 'unavailable'
  let rows: CatalogRow[]
  let position: number | null = null
  let playlist: { position: number; lists: CatalogRow[] } | null = null
  try {
    if (target.kind === 'playlist') {
      const found = await playlistPosition(http, target.name)
      if (found === 'ambiguous') return 'ambiguous'
      playlist = found
      filters = { listId: found.position }
    }
    rows = await catalogRows(http, spec.category, filters, 10_000)
    const again = await catalogRows(http, spec.category, filters, 10_000)
    if (!rows.length || !sameRows(rows, again)) return 'changed'
    if (target.track) {
      const found = resolve(rows, target.track)
      if (found === 'ambiguous') return 'ambiguous'
      if (found === 'missing') return 'changed'
      position = found
    }
    const preflight = await catalogPage(http, spec.category, filters, position ?? 0, 1)
    if (preflight.total !== rows.length || !sameRows(preflight.items, rows.slice(position ?? 0, (position ?? 0) + 1))) {
      return 'changed'
    }
    if (playlist && target.kind === 'playlist') {
      // The list itself must still sit at that position under that name.
      const lists = await catalogRows(http, 'custom', {}, 1000)
      if (
        !sameRows(lists, playlist.lists) ||
        lists.find((row) => row.pos === playlist?.position)?.name !== target.name
      ) {
        return 'changed'
      }
    }
  } catch {
    return 'changed'
  }
  try {
    deps.guard?.()
  } catch {
    return 'unavailable'
  }
  deps.attempted?.()
  const name =
    target.kind === 'album'
      ? target.album
      : target.kind === 'artistAlbum'
        ? (selector ?? '')
        : target.kind === 'playlist' && playlist
          ? `{"id":${playlist.position}}`
          : ''
  const outcome =
    position === null
      ? await session.mutate('0101', `${spec.list}${name}`, null, timeoutMs)
      : await session.mutate('0100', `${hex4(position)}${spec.list}${name}`, null, timeoutMs)
  if (outcome.status === 'unsent') return 'unavailable'
  const wanted = position === null ? null : rows[position]
  const deadline = now() + (deps.confirmMs ?? 8000)
  while (now() < deadline && session.open) {
    try {
      const observed = parsePlayback(await session.read('0202', 'a202'))
      const track = observed.track
      const inSource =
        observed.state === 'playing' &&
        observed.source === spec.source &&
        track !== null &&
        (target.kind !== 'album' || track.album === target.album) &&
        (target.kind !== 'artistAlbum' || (track.album === target.album && track.artist === target.artist))
      if (
        inSource &&
        (wanted
          ? track.title === wanted.name && track.artist === wanted.author
          : rows.some((row) => row.name === track.title && row.author === track.artist))
      ) {
        return 'playing'
      }
    } catch (error) {
      if (!(error instanceof NoObservation)) break
    }
    await sleep(deps.pauseMs ?? 150)
  }
  return 'uncertain'
}

/** A whole album (kept for readability at call sites and tests). */
export const selectAlbum = (deps: SelectionDeps, album: string) => selectSource(deps, { kind: 'album', album })
