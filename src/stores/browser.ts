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
 * Since 2026-09-30 (owner) the bar's switch chooses where music plays, and
 * the switch (stores/handoff.ts) pauses the player before this browser starts
 * with the player's track, position and queue. The queue keeps every row, so
 * its positions stay the player's for the way back; a file this browser
 * cannot play is skipped, a decoding error moves on to the next track, and a
 * network error (the player off or away) stops with the reason.
 *
 * Plays here go into the play history (owner, 2026-09-29; combined-009): the
 * service's observer sees only the player's open files, so this page counts
 * the sound it played by the observer's rule and reports each play once, with
 * the queue it came from, the serial number and a fresh request ID. A report
 * is never sent again: its outcome may be uncertain.
 */
import { computed, reactive, readonly } from 'vue'
import { nextIndex, playableIn, previousIndex, type Repeat } from '../domain/browserQueue'
import { playCounts, type PlayContext } from '../domain/history'
import type { PlaybackSource } from '../domain/playback'
import type { Track } from '../domain/track'
import { audioUrl } from '../gateway/media'
import type { SelectionTarget } from '../gateway/selection'
import { readPreference, writePreference } from '../lib/storage'
import { connection, http } from './connection'
import { loadHistory } from './history'
import { pairingToken } from './pairing'
import { toast } from './ui'

export type { Repeat }

export interface BrowserTrack {
  /** Null for a row with no known file: it keeps its place and is skipped. */
  path: string | null
  title: string
  artist: string | null
  album: string | null
  /** A CUE track starts at its offset within the image (ms). */
  offsetMs: number
  durationMs: number | null
  /** A CUE track's title: the history counts an image per track. */
  cueTitle: string | null
}

/** How the queue here can be played again on the player (the way back). */
export type BrowserOrigin =
  /** The player's own queue, as it was: its rows' paths hash, to check it did not change; its source names it. */
  | { kind: 'queue'; hash: string | null; count: number; source: PlaybackSource | null; list: string | null }
  /** A source chosen in this page (album, artist, folder, list...), played again from the track. */
  | { kind: 'target'; target: SelectionTarget }

const VOLUME_KEY = 'disc-player.browser-volume'
const savedVolume = Number(readPreference(VOLUME_KEY) ?? 100)

interface BrowserState {
  queue: BrowserTrack[]
  index: number
  playing: boolean
  position: number
  /** performance.now() of the last position update (lyrics count on from it). */
  positionAt: number | null
  lengthMs: number | null
  context: PlayContext | null
  origin: BrowserOrigin | null
  repeat: Repeat
  volume: number
}

const state = reactive<BrowserState>({
  queue: [],
  index: -1,
  playing: false,
  position: 0,
  positionAt: null,
  /** The current track's length (ms): a CUE track's own, a whole file's once the browser knows it. */
  lengthMs: null,
  /** The queue the tracks came from, for the play history. */
  context: null,
  origin: null,
  repeat: 'off',
  /** 0 to 100, as the player's volume. */
  volume: Number.isInteger(savedVolume) && savedVolume >= 0 && savedVolume <= 100 ? savedVolume : 100,
})
export const browserPlayback = readonly(state)
export const browserTrack = computed(() => state.queue[state.index] ?? null)
/** Next has somewhere to go: a later track this browser plays, or the first again with repeat. */
export const browserHasNext = computed(
  () => state.index >= 0 && nextIndex(state.queue.length, state.index, state.repeat, playable, true) !== null,
)

let audio: HTMLAudioElement | null = null
let context: AudioContext | null = null
let analyser: AnalyserNode | null = null
/** Rows of the current queue that failed to decode here. */
let failed = new Set<number>()

/* The sound heard of the current track since it started: advances of the playing element only, not seeks. */
let heardMs = 0
let lastTime: number | null = null
let reported = false

function listen(): void {
  const current = browserTrack.value
  if (!current?.path || !audio) return
  const now = audio.currentTime
  const step = lastTime === null ? 0 : now - lastTime
  lastTime = now
  // A muted start (the switch waits for the player's pause) is not heard.
  if (audio.paused || audio.muted || step <= 0 || step > 1.5) return
  heardMs += step * 1000
  if (!reported && playCounts(heardMs, state.lengthMs)) {
    reported = true
    void report(current.path, current.cueTitle, heardMs)
  }
}

/** One play into the service's history; nothing where the image takes none or the page is not paired. */
async function report(path: string, cueTitle: string | null, heard: number): Promise<void> {
  const token = pairingToken()
  if (!connection.history || connection.historyWrites === null || !token) return
  const body = {
    path,
    seconds: Math.max(1, Math.floor(heard / 1000)),
    ...(cueTitle ? { title: cueTitle } : {}),
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
  audio.volume = state.volume / 100
  audio.addEventListener('playing', () => (state.playing = true))
  audio.addEventListener('pause', () => (state.playing = false))
  audio.addEventListener('timeupdate', () => {
    const current = browserTrack.value
    if (!current || !audio) return
    state.position = Math.max(0, audio.currentTime * 1000 - current.offsetMs)
    state.positionAt = performance.now()
    listen()
    // A CUE track ends where the next one starts.
    if (current.durationMs !== null && state.position >= current.durationMs) advance(false)
  })
  audio.addEventListener('durationchange', () => {
    const current = browserTrack.value
    if (current && current.durationMs === null && audio && Number.isFinite(audio.duration))
      state.lengthMs = audio.duration * 1000
  })
  audio.addEventListener('seeked', () => (lastTime = audio?.currentTime ?? null))
  audio.addEventListener('ended', () => advance(false))
  audio.addEventListener('error', () => {
    const code = audio?.error?.code
    if (code === MediaError.MEDIA_ERR_ABORTED || !browserTrack.value) return
    if (code === MediaError.MEDIA_ERR_NETWORK) {
      // The file comes from the player: it went off or away. Moving on would fail the same way.
      audio?.pause()
      toast('browser_unreachable', true)
      return
    }
    failed.add(state.index)
    toast('browser_skipped', true)
    advance(true)
  })
  return audio
}

/** Whether this browser can play the row: by its file's name, and not failed here already. */
function playable(index: number): boolean {
  const path = state.queue[index]?.path ?? null
  return !failed.has(index) && playableIn(path, (type) => element().canPlayType(type))
}

/** Loads a row and plays it from a position within the track. */
function load(index: number, positionMs = 0, play = true): void {
  const current = state.queue[index]
  if (!current?.path) return
  state.index = index
  const player = element()
  const url = audioUrl(current.path)
  if (!player.src.endsWith(url)) player.src = url
  player.currentTime = (current.offsetMs + Math.max(0, positionMs)) / 1000
  heardMs = 0
  lastTime = null
  reported = false
  state.position = Math.max(0, positionMs)
  state.lengthMs = current.durationMs ?? (Number.isFinite(player.duration) ? player.duration * 1000 : null)
  if (!play) return
  wakeGraph()
  void player.play().catch(() => toast('browser_play_unsupported', true))
}

/** The track ended by itself (`pressed` false) or Next was pressed. */
function advance(pressed: boolean): void {
  const next = nextIndex(state.queue.length, state.index, state.repeat, playable, pressed)
  if (next === null) {
    // The queue ended: its last track stays, paused at its start.
    audio?.pause()
    if (state.index >= 0) load(state.index, 0, false)
    return
  }
  load(next)
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

/** Whether this browser can play a file, by its name (the switch refuses what it cannot). */
export function browserCanPlay(path: string | null): boolean {
  return playableIn(path, (type) => element().canPlayType(type))
}

/**
 * Starts the element muted on a file inside the listener's click, so that a
 * browser that allows sound only from a click (Safari) lets it play later,
 * once the player's pause is confirmed; `unmuteBrowser` then lets it sound.
 */
export function primeBrowser(path: string | null): void {
  const player = element()
  wakeGraph()
  if (!path) return
  player.muted = true
  player.src = audioUrl(path)
  void player.play().catch(() => undefined)
}

export function unmuteBrowser(): void {
  if (audio) audio.muted = false
}

export interface PlayOptions {
  /** Where to start within the first track (ms). */
  positionMs?: number
  origin?: BrowserOrigin | null
  repeat?: Repeat
}

type PlayableTrack = Pick<Track, 'path' | 'title' | 'artist' | 'album' | 'durationMs' | 'cue' | 'cueOffsetMs'>

/**
 * Plays tracks in this browser from the given one; a CUE track from its offset
 * in the image. `context` names the queue they came from for the history.
 * False, with the reason said, when no track from there on can play here.
 */
export function playInBrowser(
  tracks: readonly (PlayableTrack | null)[],
  from = 0,
  context: PlayContext | null = null,
  options: PlayOptions = {},
): boolean {
  failed = new Set()
  state.context = context
  state.origin = options.origin ?? null
  if (options.repeat) state.repeat = options.repeat
  state.queue = tracks.map((track) => ({
    path: track?.path ?? null,
    title: track?.title ?? '',
    artist: track?.artist ?? null,
    album: track?.album ?? null,
    offsetMs: track?.cue ? (track.cueOffsetMs ?? 0) : 0,
    // A CUE track ends where its duration says; a whole file at its end.
    durationMs: track?.cue ? track.durationMs : null,
    cueTitle: track?.cue ? track.title : null,
  }))
  const start = Math.max(0, Math.min(from, state.queue.length - 1))
  const first = playable(start) ? start : nextIndex(state.queue.length, start, 'off', playable, true)
  if (first === null || first < start) {
    toast('browser_play_unsupported', true)
    return false
  }
  load(first, first === start ? (options.positionMs ?? 0) : 0)
  unmuteBrowser()
  return true
}

export function toggleBrowser(): void {
  if (!audio || !browserTrack.value) return
  if (audio.paused) {
    wakeGraph()
    audio.muted = false
    void audio.play().catch(() => toast('browser_play_unsupported', true))
  } else audio.pause()
}

export function pauseBrowser(): void {
  audio?.pause()
}

export function nextInBrowser(): void {
  advance(true)
}

/** Previous restarts a track played for more than three seconds, as players do; else the one before. */
export function previousInBrowser(): void {
  if (state.position > 3000) {
    seekInBrowser(0)
    return
  }
  const previous = previousIndex(state.queue.length, state.index, state.repeat, playable)
  if (previous === null) seekInBrowser(0)
  else load(previous, 0, !audio?.paused)
}

export function seekInBrowser(positionMs: number): void {
  const current = browserTrack.value
  if (!audio || !current) return
  audio.currentTime = (current.offsetMs + Math.max(0, positionMs)) / 1000
  state.position = Math.max(0, positionMs)
}

/** A row of this browser's queue, from its start. */
export function selectInBrowser(index: number): void {
  if (playable(index)) load(index)
  else toast('browser_play_unsupported', true)
}

export function setBrowserVolume(value: number): void {
  state.volume = Math.max(0, Math.min(100, Math.round(value)))
  if (audio) audio.volume = state.volume / 100
  writePreference(VOLUME_KEY, state.volume === 100 ? null : String(state.volume))
}

export function setBrowserRepeat(repeat: Repeat): void {
  state.repeat = repeat
}

export function stopInBrowser(): void {
  audio?.pause()
  if (audio) audio.removeAttribute('src')
  failed = new Set()
  state.queue = []
  state.index = -1
  state.playing = false
  state.position = 0
  state.lengthMs = null
  state.context = null
  state.origin = null
}
