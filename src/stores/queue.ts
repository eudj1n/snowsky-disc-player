/** A snapshot of the stock play queue, refreshed on demand (reference: on
 * opening the panel, after this browser's selections, explicit refresh). */
import { reactive, readonly } from 'vue'
import { alignQueue } from '../domain/queue'
import type { LibraryTrack } from '../domain/track'
import { readQueue } from '../gateway/queue'
import type { CatalogRow } from '../gateway/catalog'
import { libraryTracks, queueData } from '../gateway/library'
import { http, onSessionOpened } from './connection'
import { tracks } from './library'

interface QueueModel {
  items: CatalogRow[]
  /** The library row behind each queue row (for its cover), when known. */
  details: (LibraryTrack | null)[]
  current: number | null
  status: 'idle' | 'loading' | 'ready' | 'failed'
}

const state = reactive<QueueModel>({ items: [], details: [], current: null, status: 'idle' })

/** The persisted queue with paths (data level); none when stock has none, an older card catalog or a failed read. */
async function persistedQueue(): Promise<LibraryTrack[]> {
  try {
    const data = await queueData(http)
    return data ? libraryTracks(data) : []
  } catch {
    return []
  }
}
export const queue = readonly(state)
let request = 0

export async function loadQueue(): Promise<void> {
  const current = ++request
  state.status = 'loading'
  try {
    const observed = await readQueue(http)
    if (current !== request) return
    const persisted = await persistedQueue()
    if (current !== request) return
    state.items = observed.items
    state.details = alignQueue(observed.items, persisted, tracks.value)
    state.current = observed.current
    state.status = 'ready'
  } catch {
    if (current === request) state.status = 'failed'
  }
}

// A new connection invalidates the displayed queue (reference: generation change).
onSessionOpened((session) => {
  state.items = []
  state.details = []
  state.current = null
  state.status = 'idle'
  session.onClose(() => {
    request++
    state.items = []
    state.details = []
    state.current = null
    state.status = 'idle'
  })
})
