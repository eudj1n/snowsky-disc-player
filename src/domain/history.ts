import type { Album } from './album'
import { trackKey, type LibraryTrack } from './track'

/**
 * Stock's play history (song.db RECORD_SONG through the reviewed
 * `recently_played` and `most_played` queries): one row per track stock
 * recorded, with its play count and last play time. Rows can outlive their
 * files, so views only use rows whose path is still in the library.
 */
export interface PlayRecord {
  path: string
  /** The CUE track a service play was of (combined-008); absent for a whole file. */
  title?: string | null
  playCount: number
  /** LAST_PLAY_TIME as stock stores it; used for order only. */
  lastPlayedAt: number
}

export function playRecords(rows: readonly Record<string, unknown>[]): PlayRecord[] {
  return rows.flatMap((row) => {
    const path = typeof row.PATH === 'string' && row.PATH !== '' ? row.PATH : null
    if (!path) return []
    const count = typeof row.PLAY_COUNT === 'number' && row.PLAY_COUNT > 0 ? row.PLAY_COUNT : 0
    const last = typeof row.LAST_PLAY_TIME === 'number' ? row.LAST_PLAY_TIME : 0
    return [{ path, playCount: count, lastPlayedAt: last }]
  })
}

/** Albums in the order their tracks were last played, each once, up to `count`. */
export function recentlyPlayedAlbums(
  records: readonly PlayRecord[],
  albums: readonly Album[],
  tracks: readonly LibraryTrack[],
  count: number,
): Album[] {
  const idByPath = new Map(tracks.flatMap((track) => (track.path ? [[track.path, track.id] as const] : [])))
  const albumById = new Map<number, Album>()
  for (const album of albums) for (const id of album.ids) albumById.set(id, album)
  const result: Album[] = []
  for (const record of [...records].sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)) {
    const id = idByPath.get(record.path)
    const album = id === undefined ? undefined : albumById.get(id)
    if (album && !result.includes(album)) result.push(album)
    if (result.length >= count) break
  }
  return result
}

export type TrackSort = 'library' | 'added' | 'played' | 'recent'
export const TRACK_SORTS: readonly TrackSort[] = ['library', 'added', 'played', 'recent']

/**
 * Library order (stock's), most recently added, or most played: tracks with
 * recorded plays first by count, then by last play; the rest keep library order.
 */
/**
 * The play record of a track: a CUE track's plays are its own when the service
 * named its title; older plays count for the file.
 */
function recordFinder(records: readonly PlayRecord[]): (track: LibraryTrack) => PlayRecord | undefined {
  const byKey = new Map(
    records.map((record) => [record.title ? `${record.path}\u0000${record.title.trim()}` : record.path, record]),
  )
  return (track) => {
    const key = trackKey(track)
    return key ? (byKey.get(key) ?? (track.path ? byKey.get(track.path) : undefined)) : undefined
  }
}

/** The most played of these tracks, most first (then the latest played), only those played at all. */
export function mostPlayed<T extends LibraryTrack>(
  tracks: readonly T[],
  records: readonly PlayRecord[],
  count: number,
): T[] {
  const recordOf = recordFinder(records)
  return tracks
    .flatMap((track, index) => {
      const record = recordOf(track)
      return record && record.playCount > 0 ? [{ track, index, record }] : []
    })
    .sort(
      (a, b) =>
        b.record.playCount - a.record.playCount || b.record.lastPlayedAt - a.record.lastPlayedAt || a.index - b.index,
    )
    .slice(0, count)
    .map((entry) => entry.track)
}

export function sortTracks<T extends LibraryTrack>(
  tracks: readonly T[],
  sort: TrackSort,
  records: readonly PlayRecord[] = [],
): T[] {
  if (sort === 'library') return [...tracks]
  if (sort === 'added') return [...tracks].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
  const recordOf = recordFinder(records)
  if (sort === 'recent') {
    // Played tracks by their last play, newest first; the rest keep library order.
    const last = (track: T) => recordOf(track)?.lastPlayedAt ?? 0
    return tracks
      .map((track, index) => ({ track, index, last: last(track) }))
      .sort((a, b) => b.last - a.last || a.index - b.index)
      .map((entry) => entry.track)
  }
  const played = (track: T) => recordOf(track)
  return tracks
    .map((track, index) => ({ track, index, record: played(track) }))
    .sort((a, b) => {
      const ac = a.record?.playCount ?? 0
      const bc = b.record?.playCount ?? 0
      if (ac !== bc) return bc - ac
      const al = a.record?.lastPlayedAt ?? 0
      const bl = b.record?.lastPlayedAt ?? 0
      return bl - al || a.index - b.index
    })
    .map((entry) => entry.track)
}

/**
 * Plays the service observed (next image): every play of 30 s or more, oldest
 * first, with the queue stock played it from. The device clock may be wrong,
 * so the list order is the play order; `at` is only shown when plausible.
 */
export interface PlayContext {
  /** Stock's SONG_TYPE of the queue: 3 album, 2 filtered (artist, genre...), 1 all tracks. */
  type: number | null
  count: number
  /** Order-independent hash of the queue's paths (service FNV-1a sum), when known. */
  hash: string | null
  album: string | null
  artist: string | null
  genre: string | null
  folder: string | null
}

export interface ServicePlay {
  path: string
  /** The CUE track's title (combined-008 counts a CUE image per track); null for a whole file. */
  title: string | null
  at: number
  seconds: number
  context: PlayContext
}

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)
const whole = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null

export function servicePlays(value: unknown): ServicePlay[] {
  const records = (value as { records?: unknown } | null)?.records
  if (!Array.isArray(records)) return []
  return records.flatMap((record: unknown) => {
    const r = record as Record<string, unknown> | null
    const ctx = (r?.ctx ?? null) as Record<string, unknown> | null
    const path = text(r?.path)
    if (!r || !path || !ctx) return []
    const hash = text(ctx.hash)
    return [
      {
        path,
        title: text(r.title),
        at: whole(r.t) ?? 0,
        seconds: whole(r.s) ?? 0,
        context: {
          type: whole(ctx.type),
          count: whole(ctx.count) ?? 0,
          hash: hash && /^[0-9a-f]{16}$/.test(hash) ? hash : null,
          album: text(ctx.album),
          artist: text(ctx.artist),
          genre: text(ctx.genre),
          folder: text(ctx.folder),
        },
      },
    ]
  })
}

/** Per-track counts from the service's plays (a CUE track by its title), ordered by their last play (the list order). */
export function servicePlayRecords(plays: readonly ServicePlay[]): PlayRecord[] {
  const byKey = new Map<string, PlayRecord>()
  plays.forEach((play, index) => {
    const key = play.title ? `${play.path}\u0000${play.title}` : play.path
    const record = byKey.get(key) ?? { path: play.path, title: play.title, playCount: 0, lastPlayedAt: 0 }
    record.playCount++
    record.lastPlayedAt = index + 1
    byKey.set(key, record)
  })
  return [...byKey.values()]
}

const MASK = 0xffffffffffffffffn
const pathHashes = new Map<string, bigint>()
function pathHash(path: string): bigint {
  let h = pathHashes.get(path)
  if (h !== undefined) return h
  h = 1469598103934665603n
  for (const byte of new TextEncoder().encode(path)) h = ((h ^ BigInt(byte)) * 1099511628211n) & MASK
  pathHashes.set(path, h)
  return h
}
/** The service's hash of a set of card paths: the sum of their FNV-1a 64-bit hashes. */
export function pathsHash(paths: Iterable<string>): string {
  let sum = 0n
  for (const path of paths) sum = (sum + pathHash(path)) & MASK
  return sum.toString(16).padStart(16, '0')
}

/** Where a play was started from, as the page names and opens it. */
export type PlaySource =
  | { kind: 'album'; album: Album; scope: string | null }
  | { kind: 'artist'; artist: string }
  | { kind: 'genre'; genre: string }
  | { kind: 'playlist'; playlist: { id: number; name: string; trackCount: number } }
  | { kind: 'favorites'; count: number }
  | { kind: 'library' }

export function sourceKey(source: PlaySource): string {
  switch (source.kind) {
    case 'album':
      return `album:${source.album.key}:${source.scope ?? ''}`
    case 'artist':
      return `artist:${source.artist}`
    case 'genre':
      return `genre:${source.genre}`
    case 'playlist':
      return `playlist:${String(source.playlist.id)}`
    default:
      return source.kind
  }
}

export interface SourceLibrary {
  albums: readonly Album[]
  tracks: readonly LibraryTrack[]
  favorites: readonly LibraryTrack[]
}

/**
 * Every queue the page can name, by the hash of its paths: albums (and each
 * literal artist's part of a title), literal artists, genres, the favorites
 * and all tracks. Playlists are added by the caller once their members are read.
 */
export function sourceIndex(library: SourceLibrary): Map<string, PlaySource> {
  const index = new Map<string, PlaySource>()
  const add = (tracks: readonly LibraryTrack[], source: PlaySource) => {
    const paths = tracks.flatMap((track) => (track.path ? [track.path] : []))
    if (paths.length) {
      const hash = pathsHash(paths)
      if (!index.has(hash)) index.set(hash, source)
    }
  }
  const byId = new Map(library.tracks.map((track) => [track.id, track]))
  const artistsOf = new Map<string, LibraryTrack[]>()
  const genresOf = new Map<string, LibraryTrack[]>()
  const push = (map: Map<string, LibraryTrack[]>, key: string, track: LibraryTrack) => {
    const list = map.get(key)
    if (list) list.push(track)
    else map.set(key, [track])
  }
  for (const track of library.tracks) {
    if (track.artist) push(artistsOf, track.artist, track)
    if (track.genre) push(genresOf, track.genre, track)
  }
  for (const album of library.albums) {
    const tracks = album.ids.flatMap((id) => byId.get(id) ?? [])
    add(tracks, {
      kind: 'album',
      album,
      scope: album.trackArtists.length === 1 ? (album.trackArtists[0] ?? null) : null,
    })
    for (const artist of album.trackArtists)
      add(
        tracks.filter((track) => track.artist === artist),
        { kind: 'album', album, scope: artist },
      )
  }
  for (const [artist, tracks] of artistsOf) add(tracks, { kind: 'artist', artist })
  for (const [genre, tracks] of genresOf) add(tracks, { kind: 'genre', genre })
  add(library.favorites, { kind: 'favorites', count: library.favorites.length })
  add(library.tracks, { kind: 'library' })
  return index
}

/** The artists and genres the library still has, as stock spells them in its queue. */
export interface LibraryNames {
  artists: ReadonlySet<string>
  genres: ReadonlySet<string>
}

export function libraryNames(tracks: readonly LibraryTrack[]): LibraryNames {
  const artists = new Set<string>()
  const genres = new Set<string>()
  for (const track of tracks) {
    if (track.artist) artists.add(track.artist)
    if (track.genre) genres.add(track.genre)
  }
  return { artists, genres }
}

/**
 * The source of one play: its queue's hash first; when the library changed
 * since, the fields every queue row shared (the album, a genre whose artists
 * differ, an artist), else nothing. Only what the library still has is named:
 * an album queue whose album is gone names nothing (owner, 2026-09-28: a
 * deleted album stayed on the shelf as its artist), and neither does an
 * artist or genre with no track left.
 */
export function playSource(
  context: PlayContext,
  index: ReadonlyMap<string, PlaySource>,
  albums: readonly Album[],
  names: LibraryNames,
): PlaySource | null {
  const found = context.hash ? index.get(context.hash) : undefined
  if (found) return found
  if (context.type === 1) return { kind: 'library' }
  if (context.album) {
    const album = albums.find(
      (item) => item.title === context.album && (!context.artist || item.trackArtists.includes(context.artist)),
    )
    if (album) return { kind: 'album', album, scope: context.artist }
  }
  // An album queue began at its album, not at the artist or genre it shared.
  if (context.type === 3) return null
  if (context.genre && !context.artist)
    return names.genres.has(context.genre) ? { kind: 'genre', genre: context.genre } : null
  if (context.artist) return names.artists.has(context.artist) ? { kind: 'artist', artist: context.artist } : null
  return null
}

/** The sources plays were started from, newest first, each once, without "all tracks". */
export function recentSources(
  plays: readonly ServicePlay[],
  resolve: (context: PlayContext) => PlaySource | null,
  count: number,
): { source: PlaySource; path: string }[] {
  const seen = new Set<string>()
  const result: { source: PlaySource; path: string }[] = []
  for (let i = plays.length - 1; i >= 0 && result.length < count; i--) {
    const play = plays[i]
    const source = play ? resolve(play.context) : null
    if (!play || !source || source.kind === 'library') continue
    const key = sourceKey(source)
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ source, path: play.path })
  }
  return result
}
