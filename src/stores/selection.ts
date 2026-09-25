/** Playing from the collection; the guarded sequence lives in gateway/selection.ts. */
import { reactive, readonly } from 'vue'
import { selectSource, type SelectionOutcome, type SelectionTarget } from '../gateway/selection'
import { activeSession, commandCatalog, connection, http } from './connection'
import { pairing } from './pairing'
import { playback, refreshPlayback } from './playback'
import { loadQueue } from './queue'

export type { SelectionOutcome, SelectionTarget }
const state = reactive({ busy: false })
export const selection = readonly(state)

export async function play(target: SelectionTarget): Promise<SelectionOutcome | 'busy'> {
  const session = activeSession()
  const code = target.kind === 'album' && !target.track ? '0101' : '0100'
  const entry = commandCatalog()?.records[code]
  if (!session || !pairing.paired || connection.identity?.compatible !== true || entry?.kind !== 'mutation')
    return 'unavailable'
  if (state.busy || playback.busy) return 'busy'
  state.busy = true
  try {
    const outcome = await selectSource({ session, http, timeoutMs: entry.timeout_ms }, target)
    await refreshPlayback()
    if (outcome === 'playing') void loadQueue()
    return outcome
  } finally {
    state.busy = false
  }
}
