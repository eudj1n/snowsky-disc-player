/**
 * A collection of the player's store read once and kept in this browser
 * (owner, 2026-10-23: every page load read eight collections whole). The
 * snapshot in IndexedDB holds the records with the collection's total and
 * its newest `updated`; a load asks the player for one record, the newest
 * by `updated`, which also tells the total, and takes the snapshot when
 * both match. Any write stamps a new `updated`, a removal changes the
 * total, so a changed collection is read whole again. `updated` counts
 * seconds, so a write within the same second as the newest record would
 * pass unseen: a snapshot younger than two seconds (this browser's clock,
 * an interval, no clock of the player's involved) is not trusted and the
 * collection is read whole, which covers the page's own write followed by
 * its read. The store routes know no "changed since" yet (the service's
 * `since`, to come): until then the check is one small request a
 * collection, and a change costs one whole read.
 */
import type { GatewayHttp } from '../gateway/http'
import { readCollection, type StoreRecord } from '../gateway/store'
import { cacheGet, cacheSet } from '../lib/idb'

interface Snapshot<T> {
  total: number
  updated: number
  /** This browser's clock when it was saved (ms). */
  savedAt: number
  records: StoreRecord<T>[]
}
/** A snapshot younger than this is read whole again: a write in the newest record's second would pass unseen. */
export const SETTLE_MS = 2000
const cacheKey = (collection: string) => `store:${collection}`

/** The newest record's `updated` and the collection's total; null without the collection. */
async function head(http: GatewayHttp, collection: string): Promise<{ total: number; updated: number } | null> {
  const value = (await http.serviceRead(
    `/api/store/${encodeURIComponent(collection)}/records?order=updated&desc=1&limit=1`,
  )) as { records?: unknown; total?: unknown } | null
  if (value === null) return null
  const first = Array.isArray(value.records) ? (value.records[0] as Record<string, unknown> | undefined) : undefined
  return { total: Number(value.total) || 0, updated: Number(first?.updated) || 0 }
}

/** The collection's records: this browser's snapshot while the player holds the same, else read whole and kept. */
export async function readCollectionSnapshot<T>(
  http: GatewayHttp,
  collection: string,
): Promise<StoreRecord<T>[] | null> {
  const current = await head(http, collection)
  if (current === null) return null
  const kept = await cacheGet<Snapshot<T>>(cacheKey(collection))
  if (
    kept &&
    kept.total === current.total &&
    kept.updated === current.updated &&
    Date.now() - kept.savedAt >= SETTLE_MS &&
    Array.isArray(kept.records)
  )
    return kept.records
  const records = await readCollection<T>(http, collection)
  if (records) await cacheSet(cacheKey(collection), { ...current, savedAt: Date.now(), records } satisfies Snapshot<T>)
  return records
}
