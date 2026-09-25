/**
 * The stock play queue (curlist/song) as the reference reads it (queue.py
 * read_queue): two equal reads with the same valid mark, or no observation.
 */
import { catalogRows, sameRows, catalogPage, type CatalogRow } from './catalog'
import type { GatewayHttp } from './http'

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
