/** A snapshot of the stock play queue, refreshed on demand (reference: on
 * opening the panel, after this browser's selections, explicit refresh). */
import { reactive, readonly } from 'vue'
import { readQueue } from '../gateway/queue'
import type { CatalogRow } from '../gateway/catalog'
import { http, onSessionOpened } from './connection'

interface QueueModel {
  items: CatalogRow[]
  current: number | null
  status: 'idle' | 'loading' | 'ready' | 'failed'
}

const state = reactive<QueueModel>({ items: [], current: null, status: 'idle' })
export const queue = readonly(state)
let request = 0

export async function loadQueue(): Promise<void> {
  const current = ++request
  state.status = 'loading'
  try {
    const observed = await readQueue(http)
    if (current !== request) return
    state.items = observed.items
    state.current = observed.current
    state.status = 'ready'
  } catch {
    if (current === request) state.status = 'failed'
  }
}

// A new connection invalidates the displayed queue (reference: generation change).
onSessionOpened((session) => {
  state.items = []
  state.current = null
  state.status = 'idle'
  session.onClose(() => {
    request++
    state.items = []
    state.current = null
    state.status = 'idle'
  })
})
