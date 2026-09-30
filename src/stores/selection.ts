/** Playing from the collection; the guarded sequence lives in gateway/selection.ts. */
import { selectSource, type SelectionOutcome, type SelectionTarget } from '../gateway/selection'
import { commandCatalog, connection, http } from './connection'
import { operation, run } from './operation'
import { pairing } from './pairing'
import { refreshPlayback } from './playback'
import { loadQueue } from './queue'

export type { SelectionOutcome, SelectionTarget }
/** The running device operation, for views that show it. */
export const selection = operation

/**
 * Plays a source. A request made while another operation runs waits for it
 * (one slot, the newest request wins; owner, 2026-09-29), so rows and play
 * buttons stay usable while the player confirms.
 */
export async function play(target: SelectionTarget): Promise<SelectionOutcome | 'busy' | 'superseded' | 'dropped'> {
  const code =
    target.kind === 'list'
      ? target.position === undefined
        ? '0101'
        : '0100'
      : target.kind === 'folder'
        ? target.file === undefined
          ? '0101'
          : '0100'
        : (target.kind === 'album' || target.kind === 'playlist') && !target.track
          ? '0101'
          : '0100'
  const entry = commandCatalog()?.records[code]
  if (!pairing.paired || connection.identity?.compatible !== true || entry?.kind !== 'mutation') return 'unavailable'
  const outcome = await run(
    'selection',
    async (context) => {
      await context.pace()
      return selectSource({ ...context, http, timeoutMs: entry.timeout_ms }, target)
    },
    { wait: true },
  )
  if (outcome === 'no-session') return 'unavailable'
  if (outcome === 'busy' || outcome === 'superseded' || outcome === 'dropped') return outcome
  await refreshPlayback()
  if (outcome === 'playing') void loadQueue()
  return outcome
}
