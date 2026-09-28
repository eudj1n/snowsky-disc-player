/**
 * Disliked tracks (combined-008), the store's `disliked` collection on the
 * card: a track by its path, a CUE track by its path and title. The page
 * hides them from shelves and shuffles; the service skips one that starts
 * to sound while no page holds control, and the page does the same while it
 * does.
 */
import { trackKey, type Track } from './track'

export interface DislikedValue {
  path: string
  title?: string
  artist?: string
  album?: string
  at: number
}

/** The record the store keeps for a track; a CUE track names its title. */
export function dislikedRecord(
  track: Pick<Track, 'path' | 'title' | 'cue' | 'artist' | 'album'>,
  at: number,
): DislikedValue | null {
  if (!track.path) return null
  const record: DislikedValue = { path: track.path, at }
  if (track.cue && track.title.trim()) record.title = track.title.trim()
  if (track.artist) record.artist = track.artist.slice(0, 255)
  if (track.album) record.album = track.album.slice(0, 255)
  return record
}

/** The page's key (trackKey) of a stored record. */
export function dislikedKey(value: Pick<DislikedValue, 'path' | 'title'>): string {
  return value.title ? `${value.path}\u0000${value.title}` : value.path
}

/** The store's key fields of a track, for a delete. */
export function dislikedKeyFields(track: Pick<Track, 'path' | 'title' | 'cue'>): Record<string, string> | null {
  if (!track.path) return null
  return track.cue && track.title.trim() ? { path: track.path, title: track.title.trim() } : { path: track.path }
}

export function isDislikedKey(keys: ReadonlySet<string>, track: Pick<Track, 'path' | 'title' | 'cue'>): boolean {
  const key = trackKey(track)
  return key !== null && keys.has(key)
}
