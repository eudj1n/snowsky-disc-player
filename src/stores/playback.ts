/** Playback observations and transport. Every mutation is followed by a fresh
 * read; an uncertain outcome is reported and never retried. */
import { computed, reactive, readonly } from 'vue'
import { UNKNOWN_PLAYBACK, type Playback, type TransportAction } from '../domain/playback'
import { parsePlayback } from '../gateway/playback'
import { NoObservation, type GatewaySession } from '../gateway/session'
import { activeSession, commandCatalog, connection, onSessionOpened } from './connection'
import { pairing } from './pairing'

const TRANSPORT_PAYLOAD: Record<TransportAction, string> = { toggle: '0000', next: '0001', previous: '0002' }

interface PlaybackModel {
  current: Playback
  /** A transport mutation is in flight. */
  busy: boolean
  /** The last mutation's outcome is unknown; it is not retried. */
  uncertain: boolean
}

const state = reactive<PlaybackModel>({ current: UNKNOWN_PLAYBACK, busy: false, uncertain: false })
export const playback = readonly(state)

/** The bottom player shows only while a track is observed (owner's decision):
 * playing, paused or loading. Nothing observed means nothing to control. */
export const playerVisible = computed(() => state.current.track !== null || state.current.state === 'loading')

export const canControl = computed(
  () =>
    connection.connection === 'connected' && connection.identity?.compatible === true && pairing.paired && !state.busy,
)

function observe(session: GatewaySession): void {
  session.onRecord((record) => {
    if (record.tag !== 'a202') return
    try {
      state.current = parsePlayback(record.payload)
    } catch {
      state.current = UNKNOWN_PLAYBACK
    }
  })
  session.onClose(() => (state.current = UNKNOWN_PLAYBACK))
  void refreshPlayback()
}
onSessionOpened(observe)

/** A fresh 0202 read. An unanswered read means unknown, not stopped. */
export async function refreshPlayback(): Promise<void> {
  const session = activeSession()
  if (!session) return
  try {
    state.current = parsePlayback(await session.read('0202', 'a202'))
  } catch (error) {
    if (error instanceof NoObservation) state.current = UNKNOWN_PLAYBACK
  }
}

export async function transport(action: TransportAction): Promise<void> {
  const session = activeSession()
  const entry = commandCatalog()?.records['0201']
  if (!session || !canControl.value || entry?.kind !== 'mutation') return
  state.busy = true
  state.uncertain = false
  try {
    const outcome = await session.mutate('0201', TRANSPORT_PAYLOAD[action], entry.reply, entry.timeout_ms)
    state.uncertain = outcome.status === 'uncertain'
    if (outcome.status === 'replied') await refreshPlayback()
  } finally {
    state.busy = false
  }
}
