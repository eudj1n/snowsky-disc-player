/** The latest playback observation, from 0202 reads and a202 pushes. */
import { computed, reactive, readonly } from 'vue'
import { UNKNOWN_PLAYBACK, withLibraryNames, type Playback } from '../domain/playback'
import { currentPlayback, readPlayback } from '../gateway/playback'
import { NoObservation, type GatewaySession } from '../gateway/session'
import { activeSession, onSessionOpened } from './connection'
import { tracks } from './library'

interface PlaybackModel {
  current: Playback
}

const state = reactive<PlaybackModel>({ current: UNKNOWN_PLAYBACK })
/** Library rows by card path: stock's play state cuts long names short. */
const byPath = computed(() => new Map(tracks.value.flatMap((track) => (track.path ? [[track.path, track]] : []))))
const current = computed(() => withLibraryNames(state.current, (path) => byPath.value.get(path)))
export const playback = readonly(reactive({ current }))

/** The bottom player shows only while a track is observed (owner's decision):
 * playing, paused or loading. Nothing observed means nothing to control. */
export const playerVisible = computed(() => state.current.track !== null || state.current.state === 'loading')

/** The observed track is playing: its markers pulse. Paused or unknown rests. */
export const isPlaying = computed(() => state.current.state === 'playing')

function observe(session: GatewaySession): void {
  // Records are reduced per session (partial a202 such as {"state":0} update
  // the previous state); an invalid record leaves the last valid state.
  session.onRecord((record) => {
    if (record.tag === 'a202') state.current = currentPlayback(session)
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
    state.current = await readPlayback(session)
  } catch (error) {
    if (error instanceof NoObservation) state.current = UNKNOWN_PLAYBACK
  }
}
