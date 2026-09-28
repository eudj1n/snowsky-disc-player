/**
 * The service's trash and macOS leftovers (combined-008) for the Card page
 * and the file manager. Reads need no credential; each change needs the
 * pairing serial number, is confirmed by the service's reply and is never
 * retried. Moving or restoring music changes the library only with the next
 * scan, which the page offers afterwards.
 */
import { reactive, readonly } from 'vue'
import type { Leftovers, TrashListing } from '../domain/trash'
import {
  emptyTrash,
  moveToTrash,
  purgeFromTrash,
  readLeftovers,
  readTrash,
  restoreFromTrash,
  trashLeftovers,
  type TrashReply,
} from '../gateway/trash'
import type { MessageKey } from '../i18n'
import { connection, http } from './connection'
import { pairingToken } from './pairing'
import { toast } from './ui'

const state = reactive({
  listing: null as TrashListing | null,
  leftovers: null as Leftovers | null,
  loading: false,
  busy: false,
  /** Music moved or restored since the last scan: the library is out of date. */
  rescan: false,
})
export const trash = readonly(state)

export async function loadTrash(): Promise<void> {
  if (!connection.trash) return
  state.loading = true
  try {
    const [listing, leftovers] = await Promise.all([readTrash(http), readLeftovers(http)])
    state.listing = listing
    state.leftovers = leftovers
  } catch {
    // Unreachable for now: the last listing stays.
  } finally {
    state.loading = false
  }
}

/** The service's reasons, as the page words them. */
const PROBLEMS: [RegExp, MessageKey][] = [
  [/player has it open/i, 'trash_player_open'],
  [/name is taken/i, 'trash_name_taken'],
  [/scan in progress/i, 'closed_scanning'],
  [/another card operation/i, 'please_wait_for_the_current_request'],
  [/not a file or folder|only plain files/i, 'trash_refused'],
]

async function change(
  task: (token: string) => Promise<TrashReply>,
  done: MessageKey,
  music: boolean,
): Promise<boolean> {
  const token = pairingToken()
  if (!token) {
    toast('pair_to_control')
    return false
  }
  if (state.busy) {
    toast('please_wait_for_the_current_request')
    return false
  }
  state.busy = true
  try {
    const reply = await task(token)
    if (reply.status === 200) {
      if (music) state.rescan = true
      toast(done)
      return true
    }
    const known = PROBLEMS.find(([pattern]) => reply.problem && pattern.test(reply.problem))
    toast(known ? known[1] : 'result_unconfirmed_the_command_was_not_retried', true)
    return false
  } catch {
    toast('result_unconfirmed_the_command_was_not_retried', true)
    return false
  } finally {
    state.busy = false
    await loadTrash()
  }
}

export const trashPath = (path: string): Promise<boolean> =>
  change((token) => moveToTrash(http, path, token), 'trash_moved', true)
export const restoreEntry = (id: number): Promise<boolean> =>
  change((token) => restoreFromTrash(http, id, token), 'trash_restored', true)
export const purgeEntry = (id: number): Promise<boolean> =>
  change((token) => purgeFromTrash(http, id, token), 'trash_purged', false)
export const emptyAll = (): Promise<boolean> => change((token) => emptyTrash(http, token), 'trash_emptied', false)
export const moveLeftovers = (): Promise<boolean> =>
  change((token) => trashLeftovers(http, token), 'leftovers_moved', false)

/** The library was scanned again: nothing moved is waiting for it. */
export function libraryRescanned(): void {
  state.rescan = false
}
