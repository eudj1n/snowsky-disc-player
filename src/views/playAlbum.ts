/** Playback actions shared by views: whole albums and single tracks. */
import type { SelectionTarget } from '../gateway/selection'
import type { MessageKey } from '../i18n'
import { play } from '../stores/selection'
import { toast } from '../stores/ui'
import { ensureControl } from './ensureControl'

const MESSAGES: Record<string, [MessageKey, boolean]> = {
  playing: ['done_verified_on_disc', false],
  busy: ['please_wait_for_the_current_request', false],
  changed: ['selection_changed', true],
  ambiguous: ['selection_ambiguous', true],
  unavailable: ['selection_unavailable', true],
  uncertain: ['result_unconfirmed_the_command_was_not_retried', true],
}

export async function playFrom(target: SelectionTarget): Promise<void> {
  if (!(await ensureControl())) return
  const [key, error] = MESSAGES[await play(target)] ??
    MESSAGES.uncertain ?? ['result_unconfirmed_the_command_was_not_retried', true]
  toast(key, error)
}

export const playAlbumAction = (album: string) => playFrom({ kind: 'album', album })
