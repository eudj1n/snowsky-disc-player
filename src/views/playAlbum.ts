/**
 * Playback actions shared by views: whole albums and single tracks. They play
 * where the bar's switch says (owner, 2026-09-30): on the player through the
 * guarded selection, or in this browser at once.
 */
import { albumScope, type Album } from '../domain/album'
import type { SelectionTarget } from '../gateway/selection'
import type { MessageKey } from '../i18n'
import { playTargetInBrowser } from '../stores/handoff'
import { output } from '../stores/output'
import { play } from '../stores/selection'
import { toast } from '../stores/ui'
import { ensureControl } from './ensureControl'

const MESSAGES: Record<string, [MessageKey, boolean]> = {
  playing: ['done_verified_on_disc', false],
  busy: ['please_wait_for_the_current_request', false],
  dropped: ['waiting_dropped', true],
  changed: ['selection_changed', true],
  ambiguous: ['selection_ambiguous', true],
  unavailable: ['selection_unavailable', true],
  uncertain: ['result_unconfirmed_the_command_was_not_retried', true],
}

export async function playFrom(target: SelectionTarget): Promise<void> {
  if (output.side === 'browser') {
    await playTargetInBrowser(target)
    return
  }
  if (!(await ensureControl())) return
  const outcome = await play(target)
  // A newer play took this one's place while it waited: only the newer one reports.
  if (outcome === 'superseded') return
  const [key, error] = MESSAGES[outcome] ??
    MESSAGES.uncertain ?? ['result_unconfirmed_the_command_was_not_retried', true]
  toast(key, error)
}

/** A whole album: one artist's release when scoped, else the stock title group. */
export const playAlbumAction = (album: string, artist: string | null = null) =>
  playFrom(artist ? { kind: 'artistAlbum', artist, album } : { kind: 'album', album })

/** A card's play button: the album in the card's scope (its only artist, or the page's artist). */
export const playAlbumCard = (album: Album, artist: string | null = null) =>
  playAlbumAction(album.title, artist ?? albumScope(album))
