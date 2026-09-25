/**
 * Playlist changes through the single operation lease (pacing, scan guard,
 * one attempt), with the reference outcomes as toasts. A confirmed or
 * uncertain change refreshes the collection so lists and counts show what the
 * player now holds.
 */
import { reactive, readonly } from 'vue'
import {
  addTracks,
  createPlaylist,
  deletePlaylist,
  removeTrack,
  renamePlaylist,
  type EditDeps,
  type EditOutcome,
} from '../gateway/playlists'
import type { TrackKey } from '../gateway/selection'
import type { MessageKey } from '../i18n'
import { http } from './connection'
import { loadCollection } from './library'
import { run } from './operation'
import { pairingToken } from './pairing'
import { playback } from './playback'
import { toast } from './ui'

const state = reactive({ revision: 0 })
/** Increments after a change that may have altered playlist members. */
export const playlistEdits = readonly(state)

export type PlaylistResult = EditOutcome | 'busy' | 'no-session' | 'playing'

const MESSAGES: Record<PlaylistResult, [MessageKey, boolean]> = {
  confirmed: ['done_verified_on_disc', false],
  already: ['already_set', false],
  invalid: ['playlist_invalid_name', true],
  exists: ['playlist_exists', true],
  duplicate: ['playlist_duplicate', true],
  changed: ['selection_changed', true],
  ambiguous: ['selection_ambiguous', true],
  'not-sent': ['result_unconfirmed_the_command_was_not_retried', true],
  uncertain: ['result_unconfirmed_the_command_was_not_retried', true],
  busy: ['please_wait_for_the_current_request', false],
  'no-session': ['pair_to_control', true],
  playing: ['playlist_delete_playing', true],
}

export function playlistMessage(result: PlaylistResult): [MessageKey, boolean] {
  return MESSAGES[result]
}

async function change(name: string, task: (deps: EditDeps) => Promise<EditOutcome>): Promise<PlaylistResult> {
  const token = pairingToken()
  if (!token) return 'no-session'
  const result = await run(name, async (context) => {
    await context.pace()
    return task({ http, token, guard: context.guard, attempted: context.attempted })
  })
  if (result === 'confirmed' || result === 'uncertain') {
    state.revision++
    await loadCollection(true)
  }
  const [key, error] = MESSAGES[result]
  toast(key, error)
  return result
}

export const createPlaylistNamed = (name: string) => change('playlist', (deps) => createPlaylist(deps, name))
export const renamePlaylistTo = (name: string, next: string) =>
  change('playlist', (deps) => renamePlaylist(deps, name, next))
export const addToPlaylist = (playlist: string, tracks: readonly TrackKey[]) =>
  change('playlist', (deps) => addTracks(deps, playlist, tracks))
export const removeFromPlaylist = (playlist: string, track: TrackKey) =>
  change('playlist', (deps) => removeTrack(deps, playlist, track))

/** Deleting while a playlist plays is not reviewed: refused until playback moves elsewhere. */
export async function deletePlaylistNamed(name: string): Promise<PlaylistResult> {
  if (playback.current.source === 'playlist') {
    const [key, error] = MESSAGES.playing
    toast(key, error)
    return 'playing'
  }
  return change('playlist', (deps) => deletePlaylist(deps, name))
}
