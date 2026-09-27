/** Playing from the collection; the guarded sequence lives in gateway/selection.ts. */
import { selectSource, type SelectionOutcome, type SelectionTarget } from '../gateway/selection'
import { commandCatalog, connection, http } from './connection'
import { operation, run } from './operation'
import { pairing } from './pairing'
import { refreshPlayback } from './playback'
import { loadQueue } from './queue'

export type { SelectionOutcome, SelectionTarget }
/** Views disable playback buttons while any device operation runs. */
export const selection = operation

export async function play(target: SelectionTarget): Promise<SelectionOutcome | 'busy'> {
  const code =
    target.kind === 'folder'
      ? target.file === undefined
        ? '0101'
        : '0100'
      : (target.kind === 'album' || target.kind === 'playlist') && !target.track
        ? '0101'
        : '0100'
  const entry = commandCatalog()?.records[code]
  if (!pairing.paired || connection.identity?.compatible !== true || entry?.kind !== 'mutation') return 'unavailable'
  const outcome = await run('selection', async (context) => {
    await context.pace()
    return selectSource({ ...context, http, timeoutMs: entry.timeout_ms }, target)
  })
  if (outcome === 'no-session') return 'unavailable'
  if (outcome === 'busy') return 'busy'
  await refreshPlayback()
  if (outcome === 'playing') void loadQueue()
  return outcome
}
