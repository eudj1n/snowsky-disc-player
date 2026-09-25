/** The latest playback observation, from 0202 reads and a202 pushes. */
import { computed, reactive, readonly } from 'vue'
import { UNKNOWN_PLAYBACK, type Playback } from '../domain/playback'
import { parsePlayback } from '../gateway/playback'
import { NoObservation, type GatewaySession } from '../gateway/session'
import { activeSession, onSessionOpened } from './connection'

interface PlaybackModel {
  current: Playback
}

const state = reactive<PlaybackModel>({ current: UNKNOWN_PLAYBACK })
export const playback = readonly(state)

/** The bottom player shows only while a track is observed (owner's decision):
 * playing, paused or loading. Nothing observed means nothing to control. */
export const playerVisible = computed(() => state.current.track !== null || state.current.state === 'loading')

/** The observed track is playing: its markers pulse. Paused or unknown rests. */
export const isPlaying = computed(() => state.current.state === 'playing')

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
