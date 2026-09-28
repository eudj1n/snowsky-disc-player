/**
 * Disliked tracks (combined-008) on the service's store, shared by every
 * browser and the service's own skip rule. Read on start and after each
 * change; a change needs the pairing serial number and is confirmed by the
 * service's reply. While this page holds control it applies the rule itself
 * (the service leaves it to the control owner): a disliked track that starts
 * to play is skipped with Next, at most ten times in a row.
 */
import { computed, reactive, readonly, watch } from 'vue'
import { dislikedKey, dislikedKeyFields, dislikedRecord, isDislikedKey, type DislikedValue } from '../domain/disliked'
import { trackKey, type Track } from '../domain/track'
import { deleteRecord, putRecord, readCollection } from '../gateway/store'
import { connection, http } from './connection'
import { transport } from './controls'
import { tracks } from './library'
import { operation } from './operation'
import { pairing, pairingToken } from './pairing'
import { playback } from './playback'
import { toast } from './ui'

const COLLECTION = 'disliked'
const SKIPS_IN_A_ROW = 10

const state = reactive({
  records: [] as DislikedValue[],
  /** The store answered: this image and card release have the collection. */
  available: false,
  busy: false,
})
export const disliked = readonly(state)

const keys = computed(() => new Set(state.records.map(dislikedKey)))

export function isDisliked(track: Pick<Track, 'path' | 'title' | 'cue'>): boolean {
  return isDislikedKey(keys.value, track)
}

/** Disliked tracks of the library, newest dislike first; records whose file is gone are left out. */
export const dislikedTracks = computed(() => {
  const at = new Map(state.records.map((record) => [dislikedKey(record), record.at]))
  return tracks.value
    .filter((track) => at.has(trackKey(track) ?? ''))
    .sort((a, b) => (at.get(trackKey(b) ?? '') ?? 0) - (at.get(trackKey(a) ?? '') ?? 0))
})

export async function loadDisliked(): Promise<void> {
  if (!connection.store) return
  try {
    const records = await readCollection<DislikedValue>(http, COLLECTION)
    state.available = records !== null
    state.records = (records ?? []).flatMap((record) => (typeof record.value.path === 'string' ? [record.value] : []))
  } catch {
    // Unreachable for now: the last list stays.
  }
}
watch(
  () => connection.store,
  (store) => {
    if (store) void loadDisliked()
  },
  { immediate: true },
)

/** Dislikes a track, or takes the dislike back. */
export async function toggleDislike(track: Pick<Track, 'path' | 'title' | 'cue' | 'artist' | 'album'>): Promise<void> {
  const token = pairingToken()
  if (!token) {
    toast('pair_to_control')
    return
  }
  if (state.busy) {
    toast('please_wait_for_the_current_request')
    return
  }
  const wasDisliked = isDisliked(track)
  state.busy = true
  try {
    const fields = dislikedKeyFields(track)
    const record = dislikedRecord(track, Math.floor(Date.now() / 1000))
    if (!fields || !record) return
    const outcome = wasDisliked
      ? await deleteRecord(http, COLLECTION, fields, token)
      : await putRecord(http, COLLECTION, { ...record }, token)
    if (outcome === 'confirmed') toast(wasDisliked ? 'dislike_removed' : 'disliked_done')
    else if (outcome === 'full') toast('disliked_full', true)
    else toast('result_unconfirmed_the_command_was_not_retried', true)
  } catch {
    toast('result_unconfirmed_the_command_was_not_retried', true)
  } finally {
    state.busy = false
    await loadDisliked()
  }
}

// The skip rule while this page holds control: once per start of a disliked
// track, after a running operation (a selection being confirmed) ends, so
// Next is never refused as busy. Pausing and resuming it does not skip again.
let streak = 0
let handled: string | null = null
watch(
  () =>
    [playback.current.track ? trackKey(playback.current.track) : null, playback.current.state, operation.busy] as const,
  ([key, playing, busy]) => {
    if (key !== handled) handled = null
    const track = playback.current.track
    if (!key || !track || !isDisliked(track)) {
      // A track that is not disliked ends a run of skips.
      if (key) streak = 0
      return
    }
    if (playing !== 'playing' || busy || handled === key) return
    if (!pairing.paired || connection.connection !== 'connected' || streak >= SKIPS_IN_A_ROW) return
    handled = key
    streak++
    void transport('next')
  },
)
