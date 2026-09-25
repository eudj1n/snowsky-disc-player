import type { Track } from './track'

/** A snapshot alone never proves a final stop: there is no "stopped" state. */
export type PlaybackState = 'unknown' | 'loading' | 'playing' | 'paused'

/** Reviewed stock playerflag values (reference Controller PlaybackSource). */
export const PLAYBACK_SOURCES = {
  0: 'queue',
  1: 'library',
  2: 'artist',
  3: 'album',
  4: 'folder',
  5: 'playlist',
  6: 'favorites',
  // One artist's tracks of an album title (type-7 selector).
  7: 'artistAlbum',
  // A genre, whole or narrowed to an album (type-8 selector).
  8: 'genre',
  // One track selected by position in a whole genre (type 000A).
  10: 'genreTrack',
} as const
export type PlaybackSource = (typeof PLAYBACK_SOURCES)[keyof typeof PLAYBACK_SOURCES]

/** The source for a wire playerflag, or null when it is not reviewed. */
export function playbackSource(flag: number): PlaybackSource | null {
  return Object.hasOwn(PLAYBACK_SOURCES, flag) ? PLAYBACK_SOURCES[flag as keyof typeof PLAYBACK_SOURCES] : null
}

export interface Playback {
  state: PlaybackState
  track: Track | null
  favorite: boolean | null
  source: PlaybackSource | null
}

export const UNKNOWN_PLAYBACK: Playback = { state: 'unknown', track: null, favorite: null, source: null }

export type TransportAction = 'previous' | 'toggle' | 'next'
