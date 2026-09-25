import type { Track } from './track'

/** A snapshot alone never proves a final stop: there is no "stopped" state. */
export type PlaybackState = 'unknown' | 'loading' | 'playing' | 'paused'

/** Reviewed stock playerflag values, in wire order. */
export const PLAYBACK_SOURCES = ['queue', 'library', 'artist', 'album', 'folder', 'playlist', 'favorites'] as const
export type PlaybackSource = (typeof PLAYBACK_SOURCES)[number]

export interface Playback {
  state: PlaybackState
  track: Track | null
  favorite: boolean | null
  source: PlaybackSource | null
}

export const UNKNOWN_PLAYBACK: Playback = { state: 'unknown', track: null, favorite: null, source: null }

export type TransportAction = 'previous' | 'toggle' | 'next'
