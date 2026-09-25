/** Mapping of library data queries into domain objects. */
import type { LibrarySummary } from '../domain/library'
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
  }
}
