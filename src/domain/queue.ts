import { sameTrack, type LibraryTrack, type Track } from './track'

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

/** Two names of one track, one of them possibly cut short by stock (long names arrive cut). */
function sameName(a: string, b: string): boolean {
  const left = a.trim().toLowerCase()
  const right = b.trim().toLowerCase()
  return left !== '' && right !== '' && (left === right || left.startsWith(right) || right.startsWith(left))
}

/**
 * The row of the shown queue that holds the playing track (owner, 2026-09-29:
 * the mark must follow playback between refreshes of the queue): the position
 * stock reports with the track when that row is the track (its file, or its
 * name where the row has no library match), else the one row that is.
 * Null when the track is not in the shown queue (another queue plays).
 */
export function queueRowOf(
  items: readonly { name: string }[],
  details: readonly (Pick<Track, 'path' | 'title' | 'cue'> | null)[],
  track: Pick<Track, 'path' | 'title' | 'cue' | 'queuePosition'> | null,
): number | null {
  if (!track) return null
  const holds = (index: number) => {
    const detail = details[index]
    if (detail?.path && track.path) return sameTrack(detail, track)
    const name = items[index]?.name
    return name !== undefined && sameName(name, track.title)
  }
  const at = track.queuePosition
  if (at !== null && at >= 0 && at < items.length && holds(at)) return at
  const found = items.flatMap((_, index) => (holds(index) ? [index] : []))
  return found.length === 1 ? (found[0] ?? null) : null
}
