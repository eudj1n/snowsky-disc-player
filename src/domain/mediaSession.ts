/**
 * What the browser's media session is told about this page's own playback
 * (owner, 2026-10-21): the system's media keys and the browser's media
 * panel then show the track and drive it. Plain data; layout/mediaSession.ts
 * hands it to navigator.mediaSession.
 */
import { creditLabel } from './artist'
import type { Track } from './track'

export interface SessionArtwork {
  src: string
  type?: string
}

export interface SessionMetadata {
  title: string
  artist: string
  album: string
  artwork: SessionArtwork[]
}

/** The session's metadata for a track; a joint credit reads "A & B" as on the page. */
export function sessionMetadata(track: Track | null, artwork: SessionArtwork | null): SessionMetadata | null {
  if (!track) return null
  return {
    title: track.title,
    artist: track.artist ? creditLabel(track.artist) : '',
    album: track.album ?? '',
    artwork: artwork ? [artwork] : [],
  }
}

/** Where playback stood when the system was last told. */
export interface PositionMark {
  /** The track's identity: a new one is told at once. */
  key: string
  durationMs: number | null
  positionMs: number
  playing: boolean
  /** When it was read (ms on a monotonic clock). */
  at: number
}

/**
 * Whether the system's position needs telling again: a new track or length,
 * play or pause, or a position more than 1.5 s away from where the last mark
 * would have advanced to (a seek). Steady playback is left to the system,
 * which advances the position by itself.
 */
export function positionDrifted(last: PositionMark | null, now: PositionMark): boolean {
  if (!last) return true
  if (last.key !== now.key || last.durationMs !== now.durationMs || last.playing !== now.playing) return true
  const expected = last.playing ? last.positionMs + (now.at - last.at) : last.positionMs
  return Math.abs(now.positionMs - expected) > 1500
}
