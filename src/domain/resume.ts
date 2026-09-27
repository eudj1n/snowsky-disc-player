/**
 * What stock remembers when it reports nothing (owner, round 16). After the
 * queue ends, or after USB storage mode hands the card back, stock answers no
 * play state, yet its database keeps the queue (LIST_SONG_0) and the
 * memory-play record (MEMORY_PLAY: the queue row and, with "Position", the
 * position). The page shows that track as paused, as the player's own screen
 * does, and Play starts it again in the same source.
 */
import { pathsHash, type PlayContext } from './history'
import type { LibraryTrack } from './track'

export interface Remembered {
  /** The remembered queue row as a track. */
  track: LibraryTrack
  /** Where it stopped, when stock kept a position (memory playback "Position"). */
  positionMs: number | null
  /** The queue it belongs to, described as the play history describes a queue. */
  context: PlayContext
}

const whole = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/'))

/** One shared value of a field across the queue, or null when the rows differ. */
function shared(values: readonly (string | null)[]): string | null {
  const [first] = values
  return first && values.every((value) => value === first) ? first : null
}

/**
 * The remembered track from MEMORY_PLAY (its MUSIC_ID is a LIST_SONG_0 row
 * ID, not a SONG ID) and the persisted queue; null when either is missing.
 */
export function remembered(
  memory: readonly Record<string, unknown>[],
  queueRows: readonly Record<string, unknown>[],
  queue: readonly LibraryTrack[],
): Remembered | null {
  const record = memory[0]
  const id = whole(record?.MUSIC_ID)
  const track = id === null ? undefined : queue.find((row) => row.id === id)
  if (!record || !track?.path || !queue.length) return null
  const position = whole(record.POSITION)
  const paths = queue.flatMap((row) => (row.path ? [row.path] : []))
  const types = new Set(queueRows.map((row) => whole(row.SONG_TYPE)))
  const [type] = types
  return {
    track,
    positionMs: position !== null && position > 0 ? position : null,
    context: {
      type: types.size === 1 ? (type ?? null) : null,
      count: queue.length,
      hash: pathsHash(paths),
      album: shared(queue.map((row) => row.album)),
      artist: shared(queue.map((row) => row.artist)),
      genre: shared(queue.map((row) => row.genre)),
      folder: shared(paths.map(folderOf)),
    },
  }
}
