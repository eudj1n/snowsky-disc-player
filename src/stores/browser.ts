/**
 * Play in this browser (owner, 2026-09-28; combined-008): the audio file
 * comes from the service's read-only audio route (byte ranges), so a phone or
 * a TV plays a track or an album while the player rests. Independent of the
 * player: nothing is sent to it. FLAC, MP3, AAC and WAV play in every modern
 * browser, ALAC only in Safari, DSD and APE nowhere.
 *
 * The visualizer (2026-09-29) listens to the same element through a Web Audio
 * analyser, made on its first opening: a click, since browsers start audio
 * only from one. From then on the element plays through that graph.
 *
 * Starting or resuming playback here pauses the player when it plays (owner,
 * 2026-09-29), with a guarded pause in the background; the browser's own
 * sound starts at once, inside the listener's click.
 *
 * Plays here go into the play history (owner, 2026-09-29; combined-009): the
 * service's observer sees only the player's open files, so this page counts
 * the sound it played by the observer's rule and reports each play once, with
 * the queue it came from, the serial number and a fresh request ID. A report
 * is never sent again: its outcome may be uncertain.
 */
import { computed, reactive, readonly } from 'vue'
import { playCounts, type PlayContext } from '../domain/history'
import type { Track } from '../domain/track'
import { audioUrl } from '../gateway/media'
import { connection, http } from './connection'
import { pausePlayer } from './controls'
import { loadHistory } from './history'
import { pairingToken } from './pairing'
import { toast } from './ui'

interface BrowserTrack {
  path: string
  title: string
  artist: string | null
  album: string | null
  /** A CUE track starts at its offset within the image (ms). */
  offsetMs: number
  durationMs: number | null
  /** A CUE track's title: the history counts an image per track. */
  cueTitle: string | null
}

const state = reactive({
  queue: [] as BrowserTrack[],
  index: -1,
  playing: false,
  position: 0,
  /** The current track's length (ms): a CUE track's own, a whole file's once the browser knows it. */
  lengthMs: null as number | null,
  /** The queue the tracks came from (an album), for the play history. */
  context: null as PlayContext | null,
})
export const browserPlayback = readonly(state)
export const browserTrack = computed(() => state.queue[state.index] ?? null)

let audio: HTMLAudioElement | null = null
let context: AudioContext | null = null
let analyser: AnalyserNode | null = null

/* The sound heard of the current track since it started: advances of the playing element only, not seeks. */
let heardMs = 0
let lastTime: number | null = null
let reported = false

function listen(): void {
  const current = browserTrack.value
  if (!current || !audio) return
  const now = audio.currentTime
  const step = lastTime === null ? 0 : now - lastTime
  lastTime = now
  if (audio.paused || step <= 0 || step > 1.5) return
  heardMs += step * 1000
  if (!reported && playCounts(heardMs, state.lengthMs)) {
    reported = true
    void report(current, heardMs)
  }
}

/** One play into the service's history; nothing where the image takes none or the page is not paired. */
async function report(track: BrowserTrack, heard: number): Promise<void> {
  const token = pairingToken()
  if (!connection.history || connection.historyWrites === null || !token) return
  const body = {
    path: track.path,
    seconds: Math.max(1, Math.floor(heard / 1000)),
    ...(track.cueTitle ? { title: track.cueTitle } : {}),
    ...(state.context ? { ctx: state.context } : {}),
  }
  try {
    const reply = await http.serviceChange('/api/history', { method: 'POST', token, body })
    // Recently played and the play counts follow.
    if (reply.status === 201) void loadHistory()
  } catch {
    // Uncertain: never sent again.
  }
}

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
    listen()
    // A CUE track ends where the next one starts.
    if (current.durationMs !== null && state.position >= current.durationMs) advance()
  })
  audio.addEventListener('durationchange', () => {
    const current = browserTrack.value
    if (current && current.durationMs === null && audio && Number.isFinite(audio.duration))
      state.lengthMs = audio.duration * 1000
  })
  audio.addEventListener('seeked', () => (lastTime = audio?.currentTime ?? null))
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
  heardMs = 0
  lastTime = null
  reported = false
  state.position = 0
  state.lengthMs = current.durationMs ?? (Number.isFinite(player.duration) ? player.duration * 1000 : null)
  wakeGraph()
  void player.play().catch(() => toast('browser_play_unsupported', true))
}

function advance(): void {
  if (state.index + 1 < state.queue.length) {
    state.index++
    start()
  } else stopInBrowser()
}

/**
 * The analyser over this browser's sound, or null where the browser has no Web
 * Audio. Call it from a click or a key press: a suspended graph is silent, and
 * browsers resume one only from the user's own action.
 */
export function browserAnalyser(): AnalyserNode | null {
  if (!analyser) {
    if (typeof AudioContext === 'undefined') return null
    try {
      context = new AudioContext()
      const source = context.createMediaElementSource(element())
      const node = context.createAnalyser()
      node.fftSize = 4096
      node.smoothingTimeConstant = 0.72
      source.connect(node)
      node.connect(context.destination)
      analyser = node
    } catch {
      return null
    }
  }
  wakeGraph()
  return analyser
}

/** A graph the system suspended (a phone call, the tab in the background) resumes on the next play. */
function wakeGraph(): void {
  if (context && context.state !== 'running') void context.resume().catch(() => undefined)
}

/**
 * Plays tracks in this browser from the given one; a CUE track from its offset
 * in the image. `context` names the queue they came from for the history.
 */
export function playInBrowser(
  tracks: readonly Pick<Track, 'path' | 'title' | 'artist' | 'album' | 'durationMs' | 'cue' | 'cueOffsetMs'>[],
  from = 0,
  context: PlayContext | null = null,
): void {
  state.context = context
  state.queue = tracks.flatMap((track) =>
    track.path
      ? [
          {
            path: track.path,
            title: track.title,
            artist: track.artist,
            album: track.album,
            offsetMs: track.cue ? (track.cueOffsetMs ?? 0) : 0,
            // A CUE track ends where its duration says; a whole file at its end.
            durationMs: track.cue ? track.durationMs : null,
            cueTitle: track.cue ? track.title : null,
          },
        ]
      : [],
  )
  state.index = Math.min(from, state.queue.length - 1)
  start()
  void pausePlayer()
}

export function toggleBrowser(): void {
  if (!audio || !browserTrack.value) return
  if (audio.paused) {
    wakeGraph()
    void audio.play()
    void pausePlayer()
  } else audio.pause()
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
  state.lengthMs = null
  state.context = null
}
