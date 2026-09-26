import type { Album } from './album'
import type { LibraryTrack } from './track'

/**
 * Stock's play history (song.db RECORD_SONG through the reviewed
 * `recently_played` and `most_played` queries): one row per track stock
 * recorded, with its play count and last play time. Rows can outlive their
 * files, so views only use rows whose path is still in the library.
 */
export interface PlayRecord {
  path: string
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

export type TrackSort = 'library' | 'added' | 'played'
export const TRACK_SORTS: readonly TrackSort[] = ['library', 'added', 'played']

/**
 * Library order (stock's), most recently added, or most played: tracks with
 * recorded plays first by count, then by last play; the rest keep library order.
 */
export function sortTracks<T extends LibraryTrack>(
  tracks: readonly T[],
  sort: TrackSort,
  records: readonly PlayRecord[] = [],
): T[] {
  if (sort === 'library') return [...tracks]
  if (sort === 'added') return [...tracks].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
  const byPath = new Map(records.map((record) => [record.path, record]))
  const played = (track: T) => (track.path ? byPath.get(track.path) : undefined)
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
