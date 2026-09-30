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
  /**
   * The M3U list stock plays from ('/tmp/sdcard/Playlists/Daily mix.m3u'): it
   * reports such a play as a folder play (playerflag 4) with `is_m3u` and the
   * list's path before the file name in `m3u_file_path` (combined-009).
   */
  list?: string | null
}

/** The list of an M3U play from the song's `m3u_file_path` ('<list>.m3u/<file name>'); null otherwise. */
export function m3uList(song: Readonly<Record<string, unknown>>): string | null {
  if (song.is_m3u !== true || typeof song.m3u_file_path !== 'string') return null
  const match = /^(.+?\.m3u8?)\/[^/]+$/i.exec(song.m3u_file_path)
  return match?.[1] ?? null
}

export const UNKNOWN_PLAYBACK: Playback = { state: 'unknown', track: null, favorite: null, source: null }

/** How the library names one card file. */
export type LibraryNames = Pick<Track, 'title' | 'artist' | 'album'>

/**
 * The playing track as the library names it. Stock cuts long names short in
 * its play state (owner, round 14: "Meteora 20th Anniversary Edition" arrived
 * as "Meteora 20th Anniversary Edit", so its album link opened an empty page),
 * while its library database keeps them whole. The library row of the same
 * track wins (the same card file, and for a CUE sheet whose tracks share the
 * file also the same title); without one the play state stays as it came.
 */
export function withLibraryNames(current: Playback, lookup: (track: Track) => LibraryNames | undefined): Playback {
  const track = current.track
  const row = track?.path ? lookup(track) : undefined
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
