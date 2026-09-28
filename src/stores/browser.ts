/**
 * Play in this browser (owner, 2026-09-28; combined-008): the audio file
 * comes from the service's read-only audio route (byte ranges), so a phone or
 * a TV plays a track or an album while the player rests. Independent of the
 * player: nothing is sent to it. FLAC, MP3, AAC and WAV play in every modern
 * browser, ALAC only in Safari, DSD and APE nowhere.
 */
import { computed, reactive, readonly } from 'vue'
import type { Track } from '../domain/track'
import { audioUrl } from '../gateway/media'
import { toast } from './ui'

interface BrowserTrack {
  path: string
  title: string
  artist: string | null
  /** A CUE track starts at its offset within the image (ms). */
  offsetMs: number
  durationMs: number | null
}

const state = reactive({
  queue: [] as BrowserTrack[],
  index: -1,
  playing: false,
  position: 0,
})
export const browserPlayback = readonly(state)
export const browserTrack = computed(() => state.queue[state.index] ?? null)

let audio: HTMLAudioElement | null = null

function element(): HTMLAudioElement {
  if (audio) return audio
  audio = new Audio()
  audio.preload = 'auto'
  audio.addEventListener('playing', () => (state.playing = true))
  audio.addEventListener('pause', () => (state.playing = false))
  audio.addEventListener('timeupdate', () => {
    const current = browserTrack.value
    if (!current || !audio) return
    state.position = Math.max(0, audio.currentTime * 1000 - current.offsetMs)
    // A CUE track ends where the next one starts.
    if (current.durationMs !== null && state.position >= current.durationMs) advance()
  })
  audio.addEventListener('ended', () => advance())
  audio.addEventListener('error', () => {
    toast('browser_play_unsupported', true)
    stopInBrowser()
  })
  return audio
}

function start(): void {
  const current = browserTrack.value
  if (!current) return
  const player = element()
  const url = audioUrl(current.path)
  if (!player.src.endsWith(url)) player.src = url
  player.currentTime = current.offsetMs / 1000
  state.position = 0
  void player.play().catch(() => toast('browser_play_unsupported', true))
}

function advance(): void {
  if (state.index + 1 < state.queue.length) {
    state.index++
    start()
  } else stopInBrowser()
}

/** Plays tracks in this browser from the given one; a CUE track from its offset in the image. */
export function playInBrowser(
  tracks: readonly Pick<Track, 'path' | 'title' | 'artist' | 'durationMs' | 'cue' | 'cueOffsetMs'>[],
  from = 0,
): void {
  state.queue = tracks.flatMap((track) =>
    track.path
      ? [
          {
            path: track.path,
            title: track.title,
            artist: track.artist,
            offsetMs: track.cue ? (track.cueOffsetMs ?? 0) : 0,
            // A CUE track ends where its duration says; a whole file at its end.
            durationMs: track.cue ? track.durationMs : null,
          },
        ]
      : [],
  )
  state.index = Math.min(from, state.queue.length - 1)
  start()
}

export function toggleBrowser(): void {
  if (!audio || !browserTrack.value) return
  if (audio.paused) void audio.play()
  else audio.pause()
}

export function nextInBrowser(): void {
  advance()
}

export function stopInBrowser(): void {
  audio?.pause()
  if (audio) audio.removeAttribute('src')
  state.queue = []
  state.index = -1
  state.playing = false
  state.position = 0
}
