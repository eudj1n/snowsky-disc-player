/**
 * A collection of the player's store read once and kept in this browser
 * (owner, 2026-10-23: every page load read eight collections whole). The
 * snapshot in IndexedDB holds the records with the collection's total and
 * its newest `updated`; a load asks the player for one record, the newest
 * by `updated`, which also tells the total, and takes the snapshot when
 * both match. Any write stamps a new `updated`, a removal changes the
 * total. `updated` counts seconds, so a write within the same second as
 * the newest record would pass unseen: a snapshot younger than two seconds
 * (this browser's clock, an interval, no clock of the player's involved) is
 * not trusted on that check alone, which covers the page's own write
 * followed by its read.
 *
 * A changed collection is read as its changes (owner, 2026-10-24): the
 * records updated since a second before the snapshot's newest (the store's
 * `since`, 2026-10-23), laid over the kept ones by key. The changes cannot
 * name a removed record, so the merged records must count what the player
 * counts and end where the player's newest is; otherwise, and on a service
 * from before `since` (which refuses the parameter with 400, once a page
 * load; remembered until the next load), the collection is read whole.
 */
import { HttpError, type GatewayHttp } from '../gateway/http'
import { readCollection, type StoreRecord } from '../gateway/store'
import { cacheGet, cacheSet } from '../lib/idb'

interface Snapshot<T> {
  total: number
  updated: number
  /** This browser's clock when it was saved (ms). */
  savedAt: number
  records: StoreRecord<T>[]
}
interface Head {
  total: number
  updated: number
}
/** A snapshot younger than this is not trusted on the newest record alone: a write in its second would pass unseen. */
export const SETTLE_MS = 2000
const cacheKey = (collection: string) => `store:${collection}`

/** The service refused `since` this page load: it predates the parameter, and the collections are read whole. */
let sinceRefused = false
/** Asks the service about `since` again (a test's, or a new connection's, clean slate). */
export function forgetSinceRefusal(): void {
  sinceRefused = false
}

/** The newest record's `updated` and the collection's total; null without the collection. */
async function head(http: GatewayHttp, collection: string): Promise<Head | null> {
  const value = (await http.serviceRead(
    `/api/store/${encodeURIComponent(collection)}/records?order=updated&desc=1&limit=1`,
  )) as { records?: unknown; total?: unknown } | null
  if (value === null) return null
  const first = Array.isArray(value.records) ? (value.records[0] as Record<string, unknown> | undefined) : undefined
  return { total: Number(value.total) || 0, updated: Number(first?.updated) || 0 }
}

const keyOf = (record: StoreRecord<unknown>) => JSON.stringify(record.key)

/**
 * The kept records with the changes since the snapshot laid over them by key
 * (a replaced record keeps its place, a new one follows); null when the
 * changes cannot be read or do not add up to what the player describes.
 */
async function withChanges<T>(
  http: GatewayHttp,
  collection: string,
  kept: Snapshot<T>,
  current: Head,
): Promise<StoreRecord<T>[] | null> {
  if (sinceRefused) return null
  let changed: StoreRecord<T>[] | null
  try {
    changed = await readCollection<T>(http, collection, Math.max(0, kept.updated - 1))
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 400) throw error
    sinceRefused = true
    return null
  }
  if (changed === null) return null
  const byKey = new Map(kept.records.map((record) => [keyOf(record), record]))
  for (const record of changed) byKey.set(keyOf(record), record)
  const records = [...byKey.values()]
  const newest = records.reduce((max, record) => Math.max(max, record.updated), 0)
  return records.length === current.total && newest === current.updated ? records : null
}

/** The collection's records: this browser's snapshot while the player holds the same, else its changes laid over, else read whole; kept. */
export async function readCollectionSnapshot<T>(
  http: GatewayHttp,
  collection: string,
): Promise<StoreRecord<T>[] | null> {
  const current = await head(http, collection)
  if (current === null) return null
  const kept = await cacheGet<Snapshot<T>>(cacheKey(collection))
  const held = kept && Array.isArray(kept.records) ? kept : null
  if (
    held &&
    held.total === current.total &&
    held.updated === current.updated &&
    Date.now() - held.savedAt >= SETTLE_MS
  )
    return held.records
  const records =
    (held && (await withChanges(http, collection, held, current))) ?? (await readCollection<T>(http, collection))
  // The snapshot describes the records it holds (a write or removal between the two requests shows next time).
  if (records)
    await cacheSet(cacheKey(collection), {
      total: records.length,
      updated: records.reduce((max, record) => Math.max(max, record.updated), 0),
      savedAt: Date.now(),
      records,
    } satisfies Snapshot<T>)
  return records
}
