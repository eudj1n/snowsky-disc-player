import type { LibraryTrack } from './track'

/** One row of the stock play queue (curlist/song), with its cover when the row is known. */
export interface QueueItem {
  title: string
  artist: string | null
  cover?: Blob | null
}

/** A stock queue row: the title (or file name) and the artist stock shows. */
interface QueueRow {
  name: string
  author: string | null
}

const matches = (track: LibraryTrack, row: QueueRow) =>
  (row.name === track.title || row.name === track.fileName) && (!row.author || row.author === track.artist)

/**
 * The library rows behind the stock queue, for covers: stock's catalog rows
 * carry only a title and an artist. The persisted queue (LIST_SONG_0) lists
 * the same tracks with their paths; when it has as many rows and each agrees
 * with the stock row at the same position, it is used as it is. Otherwise a
 * row takes the one queue or library track that matches it, or stays unknown.
 */
export function alignQueue(
  items: readonly QueueRow[],
  persisted: readonly LibraryTrack[],
  library: readonly LibraryTrack[],
): (LibraryTrack | null)[] {
  if (persisted.length === items.length && items.every((row, index) => matches(persisted[index] as LibraryTrack, row)))
    return [...persisted]
  return items.map((row) => {
    for (const source of [persisted, library]) {
      const found = source.filter((track) => matches(track, row))
      if (found.length === 1) return found[0] ?? null
    }
    return null
  })
}
