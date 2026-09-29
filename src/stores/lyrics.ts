/**
 * Lyrics of the current track. The file's own come first (a same-stem .lrc
 * or the embedded text, through the gateway's media routes). Otherwise the
 * text stock prepared for the current track is used, but only when it was
 * written after this track started: stock rewrites that file a few seconds
 * into a track with lyrics and leaves it unchanged for a track without.
 *
 * A track left without lyrics can be looked up on LRCLIB (owner, 2026-09-29,
 * enrichment step 1) when the release's origins admit it: on the listener's
 * request, or for every such track once they switch that on in this browser
 * (off by default, since the track's names leave the network). What LRCLIB
 * gives is shown as not yet on the card until the listener saves it beside
 * the track as its .lrc, through the upload route, which never overwrites.
 */
import { reactive, readonly, watch } from 'vue'
import { parseLyrics, sidecarPath, type Lyrics } from '../domain/lyrics'
import { trackKey } from '../domain/track'
import { findLyrics } from '../gateway/lrclib'
import { currentLyrics, mediaLyrics, type LyricsSource } from '../gateway/media'
import { uploadFile } from '../gateway/upload'
import { readPreference, writePreference } from '../lib/storage'
import { connection, http, originAllowed } from './connection'
import { observations } from './observations'
import { run } from './operation'
import { pairingToken } from './pairing'
import { playback } from './playback'
import { toast } from './ui'

export type LyricsStatus = 'idle' | 'loading' | 'ready' | 'none' | 'unavailable'
/** An LRCLIB lookup for the current track. */
export type LyricsLookup = 'idle' | 'searching' | 'missing' | 'instrumental' | 'failed'

interface LyricsModel {
  path: string | null
  status: LyricsStatus
  lyrics: Lyrics | null
  source: LyricsSource | 'lrclib' | null
  lookup: LyricsLookup
  /** Look up every track left without lyrics (this browser's choice). */
  autoLookup: boolean
  saving: boolean
}

const AUTO_KEY = 'disc-player.lrclib-auto'
const state = reactive<LyricsModel>({
  path: null,
  status: 'idle',
  lyrics: null,
  source: null,
  lookup: 'idle',
  autoLookup: readPreference(AUTO_KEY) === '1',
  saving: false,
})
/** The LRC text found on LRCLIB for the current track, kept for saving it. */
let found: string | null = null
export const lyrics = readonly(state)

/** Pauses before asking for stock's file again after a track change. */
const PLAYER_POLLS_MS = [1500, 3000, 5000]
let request = 0
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))

function settle(text: string, source: LyricsSource | 'lrclib'): void {
  const parsed = parseLyrics(text)
  state.lyrics = parsed.lines.length ? parsed : null
  state.source = parsed.lines.length ? source : null
  state.status = parsed.lines.length ? 'ready' : 'none'
}

async function load(path: string | null, media: boolean, cue: boolean): Promise<void> {
  const current = ++request
  state.path = path
  state.lyrics = null
  state.source = null
  state.lookup = 'idle'
  found = null
  if (!path) {
    state.status = 'idle'
    return
  }
  if (!media) {
    state.status = 'unavailable'
    return
  }
  state.status = 'loading'
  // When the track started: from the observed position if known, else now.
  const startedAt = Date.now() - (observations.positionMs ?? 0)
  try {
    // A CUE track's file holds the whole sheet: its .lrc or embedded text would
    // be timed from the file's start, so only stock's own lyrics are used.
    const own = cue ? null : await mediaLyrics(http, path)
    if (current !== request) return
    if (own) {
      settle(own.text, own.source)
      return
    }
    for (const pause of PLAYER_POLLS_MS) {
      await sleep(pause)
      if (current !== request) return
      const prepared = await currentLyrics(http)
      if (current !== request) return
      if (prepared && prepared.ageSeconds <= (Date.now() - startedAt) / 1000 + 1) {
        settle(prepared.text, 'player')
        return
      }
    }
    state.status = 'none'
  } catch {
    if (current === request) state.status = 'none'
  }
  if (current === request && state.status === 'none' && state.autoLookup) void lookUpLyrics()
}

/** LRCLIB can be asked for the current track: the origins admit it and the track has no lyrics of its own. */
export function lyricsLookupAvailable(): boolean {
  const track = playback.current.track
  return originAllowed('lrclib') && !!track?.path && !track.cue && !!track.artist && state.status === 'none'
}

/** Looks the current track up on LRCLIB (its artist, title, album and length leave the network). */
export async function lookUpLyrics(): Promise<void> {
  const track = playback.current.track
  if (!lyricsLookupAvailable() || !track?.artist || state.lookup === 'searching') return
  const current = request
  state.lookup = 'searching'
  try {
    const result = await findLyrics({
      artist: track.artist,
      title: track.title,
      album: track.album,
      durationMs: track.durationMs,
    })
    if (current !== request) return
    const text = result?.synced ?? result?.plain ?? null
    if (!text) {
      state.lookup = result?.instrumental ? 'instrumental' : 'missing'
      return
    }
    found = text
    settle(text, 'lrclib')
    state.lookup = 'idle'
  } catch {
    if (current === request) state.lookup = 'failed'
  }
}

export function setAutoLookup(on: boolean): void {
  state.autoLookup = on
  writePreference(AUTO_KEY, on ? '1' : null)
  if (on && state.status === 'none' && state.lookup === 'idle') void lookUpLyrics()
}

/**
 * Saves what LRCLIB gave beside the track as its .lrc: one guarded upload
 * (the player's serial number, a fresh request ID, pacing), never over an
 * existing file; a lost reply is not retried.
 */
export async function saveFoundLyrics(): Promise<void> {
  const track = playback.current.track
  const target = track?.path ? sidecarPath(track.path) : null
  const token = pairingToken()
  if (!found || !target || state.source !== 'lrclib' || state.saving) return
  if (!token) {
    toast('pair_to_control', true)
    return
  }
  const text = found
  const current = request
  state.saving = true
  try {
    const outcome = await run('upload', async (context) => {
      await context.pace()
      context.guard()
      context.attempted()
      return uploadFile({ file: new Blob([text], { type: 'text/plain' }), path: target, token })
    }).catch(() => 'not-sent' as const)
    if (outcome === 'confirmed') {
      if (current === request) state.source = 'sidecar'
      toast('lyrics_saved')
    } else if (outcome === 'exists') toast('lyrics_save_exists', true)
    else if (outcome === 'busy') toast('please_wait_for_the_current_request')
    else if (outcome === 'no-session') toast('pair_to_control', true)
    else if (outcome === 'uncertain') toast('result_unconfirmed_the_command_was_not_retried', true)
    else toast('lyrics_save_failed', true)
  } finally {
    state.saving = false
  }
}

// Keyed by trackKey: moving between a CUE sheet's tracks keeps the file but changes the track.
watch(
  () => [playback.current.track ? trackKey(playback.current.track) : null, connection.media] as const,
  ([key, media], previous) => {
    if (previous && previous[0] === key && previous[1] === media) return
    const track = playback.current.track
    void load(track?.path ?? null, media, track?.cue === true)
  },
  { immediate: true },
)
