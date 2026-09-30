/**
 * Where music plays (owner, 2026-09-30): on the player or in this browser,
 * chosen with the bar's switch (stores/handoff.ts). What the bar, the Now
 * tab, lyrics, karaoke and the rows' playing marks show comes from here, in
 * one shape whichever side plays. The side is not kept across reloads: a
 * page opens on the player.
 */
import { computed, reactive, readonly } from 'vue'
import type { Playback } from '../domain/playback'
import type { Track } from '../domain/track'
import { browserPlayback, browserTrack } from './browser'
import { isFavorite } from './favorites'
import { observations } from './observations'
import { isPlaying, playback } from './playback'

export type Side = 'disc' | 'browser'

const state = reactive<{ side: Side; switching: boolean }>({ side: 'disc', switching: false })
export const output = readonly(state)

/** Only the switch changes the side. */
export function setSide(side: Side): void {
  state.side = side
}

export function setSwitching(switching: boolean): void {
  state.switching = switching
}

export const inBrowser = computed(() => state.side === 'browser')

/** The browser's current row as the page shows a track. */
const browserNow = computed<Track | null>(() => {
  const current = browserTrack.value
  if (!current?.path) return null
  return {
    title: current.cueTitle ?? current.title,
    artist: current.artist,
    album: current.album,
    path: current.path,
    durationMs: current.durationMs ?? browserPlayback.lengthMs,
    queuePosition: browserPlayback.index,
    ...(current.cueTitle ? { cue: true, cueOffsetMs: current.offsetMs } : {}),
  }
})

/** What plays now on the chosen side. */
export const nowPlaying = computed<Playback>(() => {
  if (state.side === 'disc') return playback.current
  const track = browserNow.value
  return {
    state: track ? (browserPlayback.playing ? 'playing' : 'paused') : 'unknown',
    track,
    favorite: track ? isFavorite(track) : null,
    source: null,
  }
})

/** The position within the track (ms), as the side reports it. */
export const nowPositionMs = computed(() =>
  state.side === 'browser' ? (browserNow.value ? browserPlayback.position : null) : observations.positionMs,
)

/** When the position was read (performance.now()), for lyrics that count on between updates. */
export const nowPositionAt = computed(() =>
  state.side === 'browser' ? browserPlayback.positionAt : observations.positionAt,
)

/** Something plays on the chosen side: its marks pulse. */
export const nowIsPlaying = computed(() => (state.side === 'browser' ? browserPlayback.playing : isPlaying.value))
