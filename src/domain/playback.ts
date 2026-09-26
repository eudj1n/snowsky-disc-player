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

/** How the library names one card file. */
export type LibraryNames = Pick<Track, 'title' | 'artist' | 'album'>

/**
 * The playing track as the library names it. Stock cuts long names short in
 * its play state (owner, round 14: "Meteora 20th Anniversary Edition" arrived
 * as "Meteora 20th Anniversary Edit", so its album link opened an empty page),
 * while its library database keeps them whole. The library row of the same
 * card file wins; without one the play state stays as it came.
 */
export function withLibraryNames(current: Playback, lookup: (path: string) => LibraryNames | undefined): Playback {
  const track = current.track
  const row = track?.path ? lookup(track.path) : undefined
  if (!track || !row) return current
  return {
    ...current,
    track: {
      ...track,
      title: row.title || track.title,
      artist: row.artist ?? track.artist,
      album: row.album ?? track.album,
    },
  }
}

export type TransportAction = 'previous' | 'toggle' | 'next'
