/** The latest playback observation, from 0202 reads and a202 pushes. */
import { computed, reactive, readonly, watch } from 'vue'
import { UNKNOWN_PLAYBACK, withLibraryNames, type Playback } from '../domain/playback'
import { remembered as rememberedFrom, type Remembered } from '../domain/resume'
import { trackKey, type Track } from '../domain/track'
import { rowsOf } from '../gateway/http'
import { libraryTracks, queueData } from '../gateway/library'
import { currentPlayback, readPlayback } from '../gateway/playback'
import { NoObservation, type GatewaySession } from '../gateway/session'
import { activeSession, http, onSessionOpened } from './connection'
import { tracks } from './library'

interface PlaybackModel {
  current: Playback
}

const state = reactive<PlaybackModel>({ current: UNKNOWN_PLAYBACK })
/**
 * Library rows by track identity: stock's play state cuts long names short.
 * A CUE sheet's tracks share one file, so their key includes the title.
 */
const byKey = computed(() => new Map(tracks.value.flatMap((track) => (track.path ? [[trackKey(track), track]] : []))))
const named = (current: Playback) => withLibraryNames(current, (track) => byKey.value.get(trackKey(track)))

/*
 * When stock reports no track (its queue ended, or USB storage mode handed the
 * card back), its database still remembers the queue and the track it stopped
 * on; the player's own screen shows that track paused. So does the page
 * (owner, round 16): the bar shows it paused, and Play starts it again in the
 * same source (stores/controls.ts).
 */
const memory = reactive({ remembered: null as Remembered | null })
export const rememberedPlayback = computed(() =>
  state.current.track === null && state.current.state !== 'loading' ? memory.remembered : null,
)
function rememberedTrack(kept: Remembered): Track {
  const { title, artist, album, path, durationMs, cue } = kept.track
  return { title, artist, album, path, durationMs, queuePosition: null, ...(cue ? { cue } : {}) }
}
const current = computed(() => {
  const kept = rememberedPlayback.value
  if (!kept) return named(state.current)
  return named({ state: 'paused', track: rememberedTrack(kept), favorite: null, source: null })
})
export const playback = readonly(reactive({ current }))

/** The bottom player shows only while a track is observed (owner's decision):
 * playing, paused or loading, or remembered by stock while it reports nothing. */
export const playerVisible = computed(
  () => state.current.track !== null || state.current.state === 'loading' || rememberedPlayback.value !== null,
)

/** Reads what stock remembers (MEMORY_PLAY and LIST_SONG_0); nothing when either is missing. */
async function loadRemembered(): Promise<void> {
  try {
    const [memoryResult, queueResult] = await Promise.all([http.data('resume_point'), queueData(http)])
    if (!queueResult) {
      memory.remembered = null
      return
    }
    memory.remembered = rememberedFrom(rowsOf(memoryResult), rowsOf(queueResult), libraryTracks(queueResult))
  } catch {
    memory.remembered = null
  }
}
watch(
  () => state.current.track === null && activeSession() !== null,
  (silent) => {
    if (silent) void loadRemembered()
  },
)

/** The observed track is playing: its markers pulse. Paused or unknown rests. */
export const isPlaying = computed(() => state.current.state === 'playing')

function observe(session: GatewaySession): void {
  // Records are reduced per session (partial a202 such as {"state":0} update
  // the previous state); an invalid record leaves the last valid state.
  session.onRecord((record) => {
    if (record.tag === 'a202') state.current = currentPlayback(session)
  })
  session.onClose(() => {
    state.current = UNKNOWN_PLAYBACK
    memory.remembered = null
  })
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
  if (state.current.track === null) await loadRemembered()
}
