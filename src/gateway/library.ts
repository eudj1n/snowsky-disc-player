/** Mapping of library data queries into domain objects. */
import type { LibrarySummary } from '../domain/library'
import type { Playlist } from '../domain/playlist'
import type { LibraryTrack } from '../domain/track'
import { rowsOf, type DataResult } from './http'

function count(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0
}

export function librarySummary(result: DataResult): LibrarySummary | null {
  const row = rowsOf(result)[0]
  if (!row) return null
  return {
    tracks: count(row.tracks),
    favorites: count(row.favorites),
    playlists: count(row.playlists),
    queue: count(row.queue),
    lastAdded: count(row.last_added),
    lastId: count(row.last_id),
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}
function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

/** Maps one row of the tracks/favorites/playlist_tracks queries. The title
 * falls back to the file name, as the stock UI shows untagged files. */
export function libraryTrack(row: Record<string, unknown>): LibraryTrack | null {
  const id = positive(row.ID)
  const fileName = text(row.NAME)
  if (id === null || fileName === null) return null
  return {
    id,
    fileName,
    title: text(row.TITLE) ?? fileName,
    artist: text(row.ARTIST),
    album: text(row.ALBUM),
    albumArtist: text(row.ALBUM_ARTIST),
    genre: text(row.GENRE),
    discNumber: positive(row.DISC),
    trackNumber: positive(row.TRACK),
    path: text(row.PATH),
    durationMs: positive(row.DURATION),
    queuePosition: null,
    addedAt: positive(row.ADD_TIME),
  }
}

export function libraryTracks(result: DataResult): LibraryTrack[] {
  return rowsOf(result).flatMap((row) => libraryTrack(row) ?? [])
}

/** Rows of the playlists query (ID, LIST_ID, LIST_NAME, M3U_PATH, tracks). */
export function playlists(result: DataResult): Playlist[] {
  return rowsOf(result).flatMap((row) => {
    const id = positive(row.ID)
    const name = text(row.LIST_NAME)
    const listId =
      typeof row.LIST_ID === 'number' && Number.isInteger(row.LIST_ID) && row.LIST_ID >= 0 ? row.LIST_ID : null
    return id === null || name === null || listId === null ? [] : [{ id, listId, name, trackCount: count(row.tracks) }]
  })
}
