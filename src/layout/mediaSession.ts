/**
 * The browser's media session for this browser's own playback (owner,
 * 2026-10-21): the track, its cover and position go to the system's media
 * controls (keyboard media keys, the browser's media panel, the lock screen),
 * whose play, pause, previous, next and seek come back here. Only while this
 * browser plays: the player's own sound is not this page's media, so the
 * session is cleared on the player's side. The enterpictureinpicture action
 * lets the browser open the mini player by itself when the tab is left while
 * music plays here (automatic picture-in-picture, allowed per site).
 */
import { watch } from 'vue'
import { positionDrifted, sessionMetadata, type PositionMark } from '../domain/mediaSession'
import { trackKey } from '../domain/track'
import {
  browserPlayback,
  nextInBrowser,
  pauseBrowser,
  previousInBrowser,
  seekInBrowser,
  toggleBrowser,
} from '../stores/browser'
import { coverFor } from '../stores/enrichment'
import { inBrowser, nowPlaying } from '../stores/output'
import { openMiniPlayer } from './miniPlayer'

/** The one action name the DOM types do not know yet. */
type SessionAction = MediaSessionAction | 'enterpictureinpicture'

export function bindMediaSession(session: MediaSession): void {
  let artworkUrl: string | null = null
  let artworkBlob: Blob | null = null
  let mark: PositionMark | null = null

  const track = () => (inBrowser.value ? nowPlaying.value.track : null)

  // The track and its cover: an object URL of the cover's bytes, given up with the cover.
  watch(
    () => {
      const current = track()
      return { current, cover: current ? coverFor(current) : null }
    },
    ({ current, cover }) => {
      if (cover !== artworkBlob) {
        if (artworkUrl) URL.revokeObjectURL(artworkUrl)
        artworkUrl = cover ? URL.createObjectURL(cover) : null
        artworkBlob = cover
      }
      const metadata = sessionMetadata(current, artworkUrl ? { src: artworkUrl, type: cover?.type } : null)
      session.metadata = metadata && typeof MediaMetadata === 'function' ? new MediaMetadata(metadata) : null
    },
    { immediate: true },
  )

  watch(
    () => (track() ? (browserPlayback.playing ? 'playing' : 'paused') : 'none'),
    (state) => (session.playbackState = state),
    { immediate: true },
  )

  // The position: told again when it jumps, not on every tick (domain/mediaSession.ts).
  watch(
    () => {
      const current = track()
      return current
        ? {
            key: trackKey(current) ?? current.title,
            durationMs: current.durationMs,
            positionMs: browserPlayback.position,
            playing: browserPlayback.playing,
            at: performance.now(),
          }
        : null
    },
    (now) => {
      if (!now) {
        mark = null
        return
      }
      if (!positionDrifted(mark, now)) return
      mark = now
      if (now.durationMs === null || now.durationMs <= 0) return
      try {
        session.setPositionState({
          duration: now.durationMs / 1000,
          position: Math.min(now.positionMs, now.durationMs) / 1000,
          playbackRate: 1,
        })
      } catch {
        // A position the browser rejects (ahead of the length): told again on the next jump.
      }
    },
  )

  const handlers: [SessionAction, MediaSessionActionHandler][] = [
    ['play', () => inBrowser.value && !browserPlayback.playing && toggleBrowser()],
    ['pause', () => inBrowser.value && pauseBrowser()],
    ['previoustrack', () => inBrowser.value && previousInBrowser()],
    ['nexttrack', () => inBrowser.value && nextInBrowser()],
    [
      'seekto',
      (details) => inBrowser.value && typeof details.seekTime === 'number' && seekInBrowser(details.seekTime * 1000),
    ],
    ['enterpictureinpicture', () => void openMiniPlayer()],
  ]
  for (const [action, handler] of handlers) {
    try {
      session.setActionHandler(action as MediaSessionAction, handler)
    } catch {
      // An action this browser does not know.
    }
  }
}

if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) bindMediaSession(navigator.mediaSession)
