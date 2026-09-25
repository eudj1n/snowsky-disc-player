/**
 * The stock play queue (curlist/song) as the reference reads it (queue.py
 * read_queue, snapshot, _select_queue): two equal reads with one valid mark,
 * the play mode before and after, and the playback state between them.
 */
import type { Playback } from '../domain/playback'
import { catalogPage, catalogRows, sameRows, type CatalogRow } from './catalog'
import type { GatewayHttp } from './http'
import { readPlayback } from './playback'
import { NoObservation, type GatewaySession } from './session'

export interface QueueObservation {
  items: CatalogRow[]
  /** Current position, or null when the queue has none. */
  current: number | null
}

export class QueueUnstable extends Error {}

export async function readQueue(http: GatewayHttp): Promise<QueueObservation> {
  const first = await catalogPage(http, 'curlist/song', {}, 0, 1)
  const rows = await catalogRows(http, 'curlist/song', {}, 10_000)
  const again = await catalogRows(http, 'curlist/song', {}, 10_000)
  const last = await catalogPage(http, 'curlist/song', {}, 0, 1)
  if (!sameRows(rows, again) || first.mark !== last.mark || first.total !== rows.length) {
    throw new QueueUnstable('The queue changed during observation')
  }
  const mark = first.mark
  return { items: rows, current: mark !== null && mark >= 0 && mark < rows.length ? mark : null }
}

interface Snapshot extends QueueObservation {
  mode: string
  playback: Playback | null
}

async function mode(session: GatewaySession): Promise<string> {
  return session.read('0105', 'a102')
}

async function snapshot(session: GatewaySession, http: GatewayHttp): Promise<Snapshot> {
  const before = await mode(session)
  const queue = await readQueue(http)
  let playback: Playback | null = null
  try {
    playback = await readPlayback(session)
  } catch (error) {
    if (!(error instanceof NoObservation)) throw error
  }
  if ((await mode(session)) !== before) throw new QueueUnstable('Play mode changed during the queue observation')
  return { ...queue, mode: before, playback }
}

const basename = (path: string | null) => (path ? (path.split('/').pop() ?? '') : '')

/** The playback shows exactly this queue row (reference _row_matches). */
function rowMatches(playback: Playback | null, row: CatalogRow | undefined, index: number): boolean {
  const track = playback?.track
  if (!track || !row) return false
  return (
    track.queuePosition === index &&
    (row.name === track.title || row.name === basename(track.path)) &&
    (!row.author || row.author === track.artist)
  )
}

export type QueueSelection = 'confirmed' | 'not-sent' | 'uncertain'

export interface QueueSelectDeps {
  session: GatewaySession
  http: GatewayHttp
  guard: () => void
  attempted: () => void
  timeoutMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

/** Selects a row of the displayed queue (0100 <index> 0000), guarded twice. */
export async function selectQueueRow(
  deps: QueueSelectDeps,
  displayed: readonly CatalogRow[],
  index: number,
): Promise<QueueSelection> {
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)))
  let before: Snapshot
  try {
    before = await snapshot(deps.session, deps.http)
    if (!sameRows(before.items, displayed)) return 'not-sent'
    const playing = before.playback?.state === 'playing' || before.playback?.state === 'paused'
    if (
      !playing ||
      before.current === null ||
      !rowMatches(before.playback, before.items[before.current], before.current)
    ) {
      return 'not-sent'
    }
    if (index < 0 || index >= before.items.length) return 'not-sent'
    deps.guard()
    const final = await snapshot(deps.session, deps.http)
    if (
      !sameRows(final.items, before.items) ||
      final.current !== before.current ||
      final.mode !== before.mode ||
      final.playback?.state !== before.playback?.state ||
      final.playback?.track?.title !== before.playback?.track?.title
    ) {
      return 'not-sent'
    }
    deps.guard()
  } catch {
    return 'not-sent'
  }
  deps.attempted()
  const outcome = await deps.session.mutate('0100', `${index.toString(16).toUpperCase().padStart(4, '0')}0000`, null)
  if (outcome.status === 'unsent') return 'not-sent'
  const deadline = now() + (deps.timeoutMs ?? 8000)
  while (now() < deadline && deps.session.open) {
    try {
      const after = await snapshot(deps.session, deps.http)
      if (!sameRows(after.items, before.items) || after.mode !== before.mode) return 'uncertain'
      if (
        after.current === index &&
        after.playback?.state === 'playing' &&
        rowMatches(after.playback, before.items[index], index)
      ) {
        return 'confirmed'
      }
    } catch {
      // Keep observing within the deadline; the selection is never resent.
    }
    await sleep(150)
  }
  return 'uncertain'
}
