/**
 * Player controls with the reference Controller's guards, all through the
 * single operation lease: transport, volume, play modes, current-track
 * favorite, seek and queue row selection. Results surface as the reference
 * toasts; nothing is retried.
 */
import { computed, reactive, readonly } from 'vue'
import {
  identityOf,
  seek as seekOnce,
  setFavorite,
  setMode,
  setVolume,
  transportAction,
  type Outcome,
  type SeekOutcome,
} from '../gateway/controls'
import { ScanObserved } from '../gateway/pacer'
import type { CatalogRow } from '../gateway/catalog'
import { selectQueueRow } from '../gateway/queue'
import type { TransportAction } from '../domain/playback'
import { muteStep } from '../domain/player'
import { timeLabel } from '../domain/track'
import type { MessageKey } from '../i18n'
import { readPreference, writePreference } from '../lib/storage'
import { connection, http } from './connection'
import { markFavorite } from './favorites'
import { refreshFavorites } from './library'
import { observations } from './observations'
import { run } from './operation'
import { pairing, pairingToken } from './pairing'
import { playback, refreshPlayback } from './playback'
import { loadQueue } from './queue'
import { toast } from './ui'

/** Stock play modes (reference MODES). */
export const MODE = { listOnce: 0, random: 1, repeatOne: 2, repeatList: 3, singleOnce: 4 } as const

type Feedback = { key: MessageKey; position?: string } | null

const state = reactive({
  pendingSeek: null as { identity: string; target: number; resumedAt: number | null } | null,
  seekFeedback: null as Feedback,
})
export const controls = readonly(state)

export const controlsReady = computed(
  () => connection.connection === 'connected' && connection.identity?.compatible === true,
)

const RESULT: Record<Outcome, [MessageKey, boolean]> = {
  confirmed: ['done_verified_on_disc', false],
  already: ['already_set', false],
  'not-sent': ['result_unconfirmed_the_command_was_not_retried', true],
  uncertain: ['result_unconfirmed_the_command_was_not_retried', true],
}

function report(result: Outcome | 'busy' | 'no-session', quiet = false): void {
  if (result === 'busy') {
    toast('please_wait_for_the_current_request')
    return
  }
  if (result === 'no-session') {
    toast('pair_to_control')
    return
  }
  const [key, error] = RESULT[result]
  if (!quiet || error) toast(key, error)
}

function paired(): boolean {
  if (!pairing.paired) {
    toast('pair_to_control')
    return false
  }
  return true
}

export async function transport(action: TransportAction): Promise<void> {
  if (!paired()) return
  const result = await run('transport', async (context) => {
    await context.pace()
    return transportAction(context, action)
  })
  await refreshPlayback()
  // Transport is frequent: only problems get a toast.
  report(result, true)
}

export async function changeVolume(value: number): Promise<void> {
  if (!paired()) return
  const result = await run('volume', async (context) => {
    await context.pace()
    return setVolume(context, value)
  })
  report(result)
  await refreshVolume()
}

const VOLUME_BEFORE_MUTE = 'disc-player.volume-before-mute'

function rememberedVolume(): number | null {
  const saved = Number(readPreference(VOLUME_BEFORE_MUTE))
  return Number.isInteger(saved) && saved > 0 ? saved : null
}

/**
 * Mute or unmute from the volume icon. The stock has no mute: volume 0 is
 * sent and the replaced level is remembered in this browser; unmuting sends
 * it back. Each step is one ordinary, verified volume change.
 */
export async function toggleMute(): Promise<void> {
  const step = muteStep(connection.volume, rememberedVolume())
  if (!step) return
  if (step.target === 0 && step.remember !== null) writePreference(VOLUME_BEFORE_MUTE, String(step.remember))
  await changeVolume(step.target)
}

/** Re-reads the observed volume (0501) after an operation. */
async function refreshVolume(): Promise<void> {
  const { refreshSettings } = await import('./connection')
  await refreshSettings()
}

export async function toggleMode(kind: 'shuffle' | 'repeat'): Promise<void> {
  if (!paired()) return
  const current = observations.mode
  const on = kind === 'shuffle' ? MODE.random : MODE.repeatList
  const wanted = current === on ? MODE.listOnce : on
  const result = await run('mode', async (context) => {
    await context.pace()
    return setMode(context, wanted)
  })
  report(result)
}

export async function toggleFavorite(): Promise<void> {
  if (!paired()) return
  const current = playback.current
  if (typeof current.favorite !== 'boolean') return
  const displayed = identityOf(current)
  const result = await run('favorite', async (context) => {
    await context.pace()
    return setFavorite(context, !current.favorite, displayed)
  })
  report(result)
  await refreshPlayback()
  // The Favorites view and row hearts read the list, not the playing record.
  await refreshFavorites()
}

/**
 * Favorites any library track through the service (next image): one guarded
 * POST that the service confirms by reading the row back; never repeated. The
 * list is read again afterwards.
 */
export async function favoriteTrack(track: { id: number; path: string | null }): Promise<void> {
  const token = pairingToken()
  if (!paired() || !token) return
  let result
  try {
    result = await run('favorite', async (context) => {
      await context.pace()
      context.guard()
      context.attempted()
      return http.favorite(track.id, token)
    })
  } catch (error) {
    if (error instanceof ScanObserved) toast('closed_scanning', true)
    else toast('result_unconfirmed_the_command_was_not_retried', true)
    return
  }
  if (result === 'busy' || result === 'no-session') {
    report(result)
    return
  }
  if (result.status === 200) {
    markFavorite(track.path, true)
    report('confirmed', true)
    await refreshFavorites()
  } else if (result.status === 503) toast('closed_scanning', true)
  else toast('result_unconfirmed_the_command_was_not_retried', true)
}

const SEEK_FEEDBACK: Record<SeekOutcome, MessageKey> = {
  confirmed: 'seek_confirmed',
  already: 'seek_confirmed',
  waiting: 'seek_paused',
  'not-sent': 'seek_unconfirmed',
  uncertain: 'seek_unconfirmed',
}

/** Seeks the displayed track to whole seconds; a paused seek waits for playback. */
export async function seekTo(seconds: number, displayed: string): Promise<void> {
  if (!paired()) return
  const positionMs = Math.round(seconds * 1000)
  const position = timeLabel(positionMs)
  state.pendingSeek = null
  state.seekFeedback = { key: 'seek_sending', position }
  const result = await run('seek', async (context) => {
    await context.pace()
    return seekOnce(context, displayed, playback.current.track?.durationMs ?? null, positionMs)
  })
  if (result === 'busy' || result === 'no-session') {
    state.seekFeedback = null
    report(result)
    return
  }
  state.seekFeedback = { key: SEEK_FEEDBACK[result], position }
  if (result === 'waiting')
    state.pendingSeek = { identity: displayed, target: Math.floor(positionMs / 1000) * 1000, resumedAt: null }
  toast(SEEK_FEEDBACK[result], result !== 'confirmed')
}

/** Paused-seek reconciliation (reference app.js updateSeek): once the same
 * track plays, the first position within [target, target + elapsed + 2000]
 * confirms it; after 8 s it is reported unconfirmed. */
export function reconcileSeek(now = Date.now()): void {
  const pending = state.pendingSeek
  if (!pending) return
  if (identityOf(playback.current) !== pending.identity) {
    state.pendingSeek = null
    state.seekFeedback = null
    return
  }
  if (playback.current.state !== 'playing') return
  pending.resumedAt ??= now
  const elapsed = now - pending.resumedAt
  const position = observations.positionMs
  if (position !== null && position >= pending.target && position <= pending.target + elapsed + 2000) {
    state.seekFeedback = { key: 'seek_confirmed' }
    state.pendingSeek = null
  } else if (elapsed > 8000) {
    state.seekFeedback = { key: 'seek_unconfirmed' }
    state.pendingSeek = null
  }
}

export async function selectInQueue(displayed: readonly CatalogRow[], index: number): Promise<void> {
  if (!paired()) return
  const result = await run('queue', async (context) => {
    await context.pace()
    return selectQueueRow({ ...context, http }, displayed, index)
  })
  report(result)
  await refreshPlayback()
  void loadQueue()
}
