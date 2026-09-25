/**
 * Guarded playback selection, after the reference Controller (session.py
 * play_album, genre_playback.py select, source_playback.py select,
 * link_commands.py play_catalog_track, playback.py GuardedHTTP and
 * verify_playing):
 *
 * 1. Read the source's stock membership twice; it must be non-empty and equal.
 * 2. Resolve the target position in that stock order (a track must match by
 *    title and artist exactly once; data-level IDs are never positions).
 * 3. Immediately before sending, re-read the target row and the total.
 * 4. Send one selection with a fresh request ID (see `plan` for each form).
 * 5. Confirm with fresh reads: playing, the expected source (playerflag), and
 *    the exact target (or, for a whole source, a member of it). The stock may
 *    shorten the album name it reports; a prefix is accepted only when the
 *    fresh album list of that scope has exactly one compatible name.
 *
 * Anything else is `uncertain`; the selection is never retried.
 */
import { catalogPage, catalogRows, sameRows, type CatalogFilters, type CatalogRow, type Category } from './catalog'
import type { GatewayHttp } from './http'
import type { PlaybackSource } from '../domain/playback'
import { mergePlayback, playbackOf, readPlaybackWire, type PlaybackWire } from './playback'
import { NoObservation, type GatewaySession } from './session'

export type SelectionOutcome = 'playing' | 'uncertain' | 'changed' | 'ambiguous' | 'unavailable'

/** What to play: a source and, optionally, one track in it. */
export type SelectionTarget =
  | { kind: 'album'; album: string; track?: TrackKey }
  /** One literal track artist's part of an album title: separates releases sharing a title. */
  | { kind: 'artistAlbum'; artist: string; album: string; track?: TrackKey }
  /** All of one literal artist's tracks (type 7 with an empty album; Play all only). */
  | { kind: 'artist'; artist: string }
  /** A whole stock genre (`style`). */
  | { kind: 'genre'; genre: string; track?: TrackKey }
  /** The tracks of an album title that carry this genre. */
  | { kind: 'genreAlbum'; genre: string; album: string; track?: TrackKey }
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

/** How one target is read, sent and confirmed. */
interface Plan {
  category: Category
  filters: CatalogFilters
  /** List type and name after the optional position: `0003<album>`. */
  payload: string
  source: PlaybackSource
  /** The album the playing track must belong to, and the list to resolve a shortened name. */
  album?: { name: string; category: Category; filters: CatalogFilters }
  /** The playing track's artist must be this literal credit. */
  artist?: string
}

const hex4 = (value: number) => value.toString(16).toUpperCase().padStart(4, '0')
const RESERVED = ['unknown_artist', 'unknown_album', 'unknown_style']
const sscanfSafe = (...names: string[]) => names.every((name) => !/["\\]/.test(name) && !RESERVED.includes(name))

/**
 * The stock parses the type-7 selector with sscanf, not JSON: key order and
 * the space after the comma matter, and quotes or backslashes cannot be
 * escaped. Reserved "unknown" tokens select nothing real (reference
 * fiio_library.artist_command).
 */
export function artistAlbumSelector(artist: string, album: string): string | null {
  return sscanfSafe(artist, album) ? `{"artist":"${artist}", "album":"${album}"}` : null
}

/** The type-8 genre selector, same sscanf rules; an empty album means the whole genre. */
export function genreSelector(genre: string, album: string): string | null {
  return sscanfSafe(genre, album) && genre !== '' ? `{"style":"${genre}", "album":"${album}"}` : null
}

/** The read, send and confirmation plan for a target, or null when the stock cannot carry it. */
function plan(target: SelectionTarget, indexed: boolean): Plan | null {
  switch (target.kind) {
    case 'album':
      return {
        category: 'album/song',
        filters: { album: target.album },
        payload: `0003${target.album}`,
        source: 'album',
        album: { name: target.album, category: 'album', filters: {} },
      }
    case 'artistAlbum': {
      const selector = artistAlbumSelector(target.artist, target.album)
      if (selector === null) return null
      return {
        category: 'artist/album/song',
        filters: { artist: target.artist, album: target.album },
        payload: `0007${selector}`,
        source: 'artistAlbum',
        album: { name: target.album, category: 'artist/album', filters: { artist: target.artist } },
        artist: target.artist,
      }
    }
    case 'artist': {
      // Controller artist_command: the empty-album type-7 form is reviewed for Play all only.
      const selector = target.artist === '' ? null : artistAlbumSelector(target.artist, '')
      return selector === null
        ? null
        : {
            category: 'artist/song',
            filters: { artist: target.artist },
            payload: `0007${selector}`,
            source: 'artistAlbum',
            artist: target.artist,
          }
    }
    case 'genre': {
      if (target.genre === '' || RESERVED.includes(target.genre)) return null
      // Controller genre_command: Play all uses type 8 with an empty album;
      // a position in the whole genre uses type 000A (a different stock path).
      if (indexed)
        return {
          category: 'style/song',
          filters: { style: target.genre },
          payload: `000A${target.genre}`,
          source: 'genreTrack',
        }
      const selector = genreSelector(target.genre, '')
      return selector === null
        ? null
        : { category: 'style/song', filters: { style: target.genre }, payload: `0008${selector}`, source: 'genre' }
    }
    case 'genreAlbum': {
      const selector = genreSelector(target.genre, target.album)
      if (selector === null) return null
      return {
        category: 'style/album/song',
        filters: { style: target.genre, album: target.album },
        payload: `0008${selector}`,
        source: 'genre',
        album: { name: target.album, category: 'style/album', filters: { style: target.genre } },
      }
    }
    case 'library':
      return { category: 'all/song', filters: {}, payload: '0001', source: 'library' }
    case 'favorites':
      return { category: 'love/song', filters: {}, payload: '0006', source: 'favorites' }
    case 'playlist':
      // The list position is resolved from `custom` before the read.
      return { category: 'custom/song', filters: {}, payload: '0005', source: 'playlist' }
  }
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

function resolve(rows: readonly CatalogRow[], track: TrackKey): number | 'ambiguous' | 'missing' {
  const matches = rows.flatMap((row, index) => (row.name === track.title && row.author === track.artist ? [index] : []))
  if (!matches.length) return 'missing'
  return matches.length === 1 && matches[0] !== undefined ? matches[0] : 'ambiguous'
}

/**
 * The reported album matches the wanted one: equal, or a shortened prefix
 * that exactly one name of the scope's fresh, stable album list starts with
 * (reference playback.album_matches).
 */
async function albumMatches(
  http: GatewayHttp,
  observed: string | null,
  album: NonNullable<Plan['album']>,
): Promise<boolean> {
  if (observed === album.name) return true
  if (!observed || !album.name.startsWith(observed)) return false
  const names = await catalogRows(http, album.category, album.filters, 10_000)
  const again = await catalogRows(http, album.category, album.filters, 10_000)
  if (!sameRows(names, again)) return false
  const compatible = names.filter((row) => row.name.startsWith(observed)).map((row) => row.name)
  return compatible.length === 1 && compatible[0] === album.name
}

export async function selectSource(deps: SelectionDeps, target: SelectionTarget): Promise<SelectionOutcome> {
  const { session, http, timeoutMs } = deps
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)))
  const spec = plan(target, 'track' in target && target.track !== undefined)
  if (!spec) return 'unavailable'
  let filters = spec.filters
  let payload = spec.payload
  let rows: CatalogRow[]
  let position: number | null = null
  let playlist: { position: number; lists: CatalogRow[] } | null = null
  try {
    if (target.kind === 'playlist') {
      const found = await playlistPosition(http, target.name)
      if (found === 'ambiguous') return 'ambiguous'
      playlist = found
      filters = { listId: found.position }
      payload = `0005{"id":${found.position}}`
    }
    rows = await catalogRows(http, spec.category, filters, 10_000)
    const again = await catalogRows(http, spec.category, filters, 10_000)
    if (!rows.length || !sameRows(rows, again)) return 'changed'
    const wantedTrack = 'track' in target ? target.track : undefined
    if (wantedTrack) {
      const found = resolve(rows, wantedTrack)
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
  const outcome =
    position === null
      ? await session.mutate('0101', payload, null, timeoutMs)
      : await session.mutate('0100', `${hex4(position)}${payload}`, null, timeoutMs)
  if (outcome.status === 'unsent') return 'unavailable'
  const wanted = position === null ? null : rows[position]
  const deadline = now() + (deps.confirmMs ?? 8000)
  let albumChecked: boolean | null = null
  // Reduced from scratch after the send (reference verify_playing), so a
  // partial record never pairs the new state with the previous song.
  let seen: PlaybackWire = {}
  while (now() < deadline && session.open) {
    try {
      seen = mergePlayback(seen, await readPlaybackWire(session))
      const observed = playbackOf(seen)
      const track = observed.track
      const member =
        track !== null &&
        (wanted
          ? track.title === wanted.name && track.artist === wanted.author
          : rows.some((row) => row.name === track.title && row.author === track.artist))
      if (
        observed.state === 'playing' &&
        observed.source === spec.source &&
        member &&
        (spec.artist === undefined || track.artist === spec.artist)
      ) {
        if (!spec.album) return 'playing'
        // A fresh list read confirms a shortened album name once per selection.
        albumChecked ??= await albumMatches(http, track.album, spec.album).catch(() => false)
        if (albumChecked) return 'playing'
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
