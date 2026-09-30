/**
 * The page's automatic playlists (owner, 2026-09-30; service combined-009):
 * M3U lists in the card's visible Playlists folder, named in the store's
 * `auto_playlists` collection so the owner's own lists there are never
 * rewritten. They are recomputed from the library and the service's history
 * when the page opens (paired) and on request, and a list is written only
 * when its entries changed. Every change carries the serial number and a
 * fresh request ID and is never retried; what the service did not confirm is
 * computed again on the next update.
 */
import { computed, reactive, readonly, watch } from 'vue'
import {
  autoEntries,
  autoPlaylist,
  listName,
  sameEntries,
  type AutoKind,
  type AutoPlaylist,
  type GlobalKind,
} from '../domain/autoPlaylists'
import { deleteList, readList, readLists, writeList, type ListFile } from '../gateway/lists'
import { deleteRecord, putRecord, readCollection } from '../gateway/store'
import { t } from '../i18n'
import { connection, http } from './connection'
import { disliked, isDisliked } from './disliked'
import { history, loadHistory, nameLists } from './history'
import { library, tracks } from './library'
import { pairing, pairingToken } from './pairing'
import { toast } from './ui'

const COLLECTION = 'auto_playlists'
const SCOPE = 'external'
/** The service paces list changes 300 ms apart. */
const PACE_MS = 350

interface AutoModel {
  lists: AutoPlaylist[]
  /** Every list in the Playlists folder, the owner's too. */
  files: ListFile[]
  /** Each automatic list's entries as last written or read. */
  entries: Record<string, string[]>
  /** The store has the collection and the image keeps external lists. */
  available: boolean
  busy: boolean
  refreshing: boolean
  /** When the lists were last brought up to date (ms). */
  refreshedAt: number | null
}
const state = reactive<AutoModel>({
  lists: [],
  files: [],
  entries: {},
  available: false,
  busy: false,
  refreshing: false,
  refreshedAt: null,
})
export const autoPlaylists = readonly(state)

export const artistList = (artist: string): AutoPlaylist | null =>
  state.lists.find((list) => list.kind === 'artist_most_played' && list.artist === artist) ?? null
export const kindList = (kind: AutoKind): AutoPlaylist | null => state.lists.find((list) => list.kind === kind) ?? null
const fileOf = (name: string) => state.files.find((file) => file.name === name) ?? null

const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))

/** What the lists are computed from; ready once the library, the history and the dislikes are read. */
const ready = computed(
  () => state.available && library.status === 'ready' && history.loaded && (disliked.available || !connection.store),
)
function input() {
  return { tracks: tracks.value, most: history.most, plays: history.plays, disliked: isDisliked }
}

/** Publishes the known lists to the history, so Recently played names their plays. */
function name(): void {
  nameLists(
    state.lists.flatMap((list) =>
      state.entries[list.name] ? [{ name: list.name, entries: state.entries[list.name] ?? [] }] : [],
    ),
  )
}

export async function loadAutoPlaylists(): Promise<void> {
  if (!connection.store || !connection.externalLists) return
  try {
    const [records, files] = await Promise.all([readCollection<unknown>(http, COLLECTION), readLists(http, SCOPE)])
    const lists = (records ?? []).flatMap((record) => autoPlaylist(record.value) ?? [])
    state.files = files ?? []
    // Their entries first: an update compares with them, and Recently played names their plays.
    for (const list of lists)
      if (state.entries[list.name] === undefined && fileOf(list.name)) {
        const content = await readList(http, SCOPE, list.name)
        if (content) state.entries[list.name] = content.entries
      }
    state.lists = lists
    state.available = records !== null && files !== null
    name()
    if (state.available && state.lists.length && !history.loaded) void loadHistory()
  } catch {
    // Unreachable for now: the last state stays.
  }
}

/** Brings every automatic list up to date, writing only those whose entries changed. */
export async function refreshAutoPlaylists(announce = false): Promise<void> {
  const token = pairingToken()
  if (!token || !ready.value || state.refreshing || state.busy) return
  state.refreshing = true
  let written = 0
  let failed = 0
  try {
    for (const list of state.lists) {
      const entries = autoEntries(list, input())
      if (!entries.length || sameEntries(state.entries[list.name] ?? [], entries)) continue
      if (written + failed) await pause(PACE_MS)
      if ((await writeList(http, token, SCOPE, list.name, entries)) === 'written') {
        state.entries[list.name] = entries
        written++
      } else failed++
    }
    if (written) state.files = (await readLists(http, SCOPE)) ?? state.files
    state.refreshedAt = Date.now()
    name()
    if (announce) toast(failed ? 'auto_failed' : written ? 'auto_refreshed' : 'auto_up_to_date', failed > 0)
  } catch {
    if (announce) toast('auto_failed', true)
  } finally {
    state.refreshing = false
  }
}

function guard(): string | null {
  const token = pairingToken()
  if (!token) {
    toast('pair_to_control')
    return null
  }
  if (state.busy || state.refreshing) {
    toast('please_wait_for_the_current_request')
    return null
  }
  return token
}

/** Makes one automatic list: its record first, then its file. */
async function make(list: AutoPlaylist): Promise<boolean> {
  const token = guard()
  if (!token) return false
  // The owner's own list of that name is never taken over.
  if (fileOf(list.name) && !state.lists.some((known) => known.name === list.name)) {
    toast('auto_name_taken', true)
    return false
  }
  const entries = autoEntries(list, input())
  if (!entries.length) {
    toast('auto_empty')
    return false
  }
  state.busy = true
  try {
    const stored = await putRecord(http, COLLECTION, { ...list }, token)
    if (stored !== 'confirmed') {
      toast(stored === 'full' ? 'auto_full' : 'auto_failed', true)
      return false
    }
    state.lists = [...state.lists.filter((known) => known.name !== list.name), list]
    const written = await writeList(http, token, SCOPE, list.name, entries)
    if (written !== 'written') {
      // The record stays: the next update writes the list.
      toast(written === 'full' ? 'auto_full' : 'auto_failed', true)
      return false
    }
    state.entries[list.name] = entries
    state.files = (await readLists(http, SCOPE).catch(() => null)) ?? state.files
    name()
    toast('auto_made', false, { name: list.name })
    return true
  } finally {
    state.busy = false
  }
}

const now = () => Math.floor(Date.now() / 1000)

/** An artist's most played tracks as a list the player keeps (the artist page's button). */
export function makeArtistList(artist: string): Promise<boolean> {
  return make({ name: listName(t('auto_name_artist', { artist })), kind: 'artist_most_played', artist, at: now() })
}

/** One of the lists that are not an artist's (the Playlists page). */
export function makeKindList(kind: GlobalKind): Promise<boolean> {
  return make({ name: listName(t(`auto_name_${kind}`)), kind, at: now() })
}

/** Removes a list: its file first (a record left behind only makes the next update write it again), then its record. */
export async function removeAutoList(list: AutoPlaylist): Promise<void> {
  const token = guard()
  if (!token) return
  state.busy = true
  try {
    if ((await deleteList(http, token, SCOPE, list.name)) !== 'deleted') {
      toast('auto_failed', true)
      return
    }
    if ((await deleteRecord(http, COLLECTION, { name: list.name }, token)) !== 'confirmed') {
      toast('auto_failed', true)
      return
    }
    state.lists = state.lists.filter((known) => known.name !== list.name)
    state.entries = Object.fromEntries(Object.entries(state.entries).filter(([key]) => key !== list.name))
    state.files = state.files.filter((file) => file.name !== list.name)
    name()
    toast('auto_removed', false, { name: list.name })
  } finally {
    state.busy = false
  }
}

watch(
  () => connection.store && connection.externalLists,
  (on) => {
    if (on) void loadAutoPlaylists()
  },
  { immediate: true },
)

// Once per page load, when everything the lists come from is read and the page is paired.
let updatedOnOpen = false
watch(
  () => ready.value && pairing.paired && state.lists.length > 0,
  (go) => {
    if (!go || updatedOnOpen) return
    updatedOnOpen = true
    void refreshAutoPlaylists()
  },
  { immediate: true },
)
