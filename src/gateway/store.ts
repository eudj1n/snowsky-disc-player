/**
 * The service's store (combined-008): collections the card's reviewed
 * store.json declares, kept in the service's database on the card and shared
 * by every browser. Reads need no credential; a change carries the serial
 * number and is confirmed by the service's own reply (it wrote the database),
 * never retried.
 */
import type { GatewayHttp } from './http'

export interface StoreRecord<T> {
  key: unknown[]
  value: T
  updated: number
}

const PAGE = 500
const MAX_PAGES = 40

/** Every record of a collection, oldest first; null where the image or the card release has no store. */
export async function readCollection<T>(http: GatewayHttp, collection: string): Promise<StoreRecord<T>[] | null> {
  const records: StoreRecord<T>[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const value = (await http.serviceRead(
      `/api/store/${encodeURIComponent(collection)}/records?limit=${String(PAGE)}&offset=${String(page * PAGE)}`,
    )) as { records?: unknown; truncated?: unknown } | null
    if (value === null) return page ? records : null
    if (!Array.isArray(value.records)) throw new SyntaxError('Invalid store page')
    for (const record of value.records as Record<string, unknown>[]) {
      if (Array.isArray(record.key) && record.value && typeof record.value === 'object')
        records.push({ key: record.key, value: record.value as T, updated: Number(record.updated) || 0 })
    }
    if (value.truncated !== true || value.records.length === 0) break
  }
  return records
}

export type StoreOutcome = 'confirmed' | 'refused' | 'full' | 'uncertain'

function outcome(status: number): StoreOutcome {
  if (status === 200) return 'confirmed'
  if (status === 409) return 'full'
  return status >= 400 && status < 500 ? 'refused' : 'uncertain'
}

/** Creates or replaces one record (declared fields only). */
export async function putRecord(
  http: GatewayHttp,
  collection: string,
  value: Record<string, unknown>,
  token: string,
): Promise<StoreOutcome> {
  const reply = await http.serviceChange(`/api/store/${encodeURIComponent(collection)}/record`, {
    method: 'PUT',
    token,
    body: value,
  })
  return outcome(reply.status)
}

/** Deletes one record named by its key fields; a record already gone is confirmed too. */
export async function deleteRecord(
  http: GatewayHttp,
  collection: string,
  key: Record<string, string | number>,
  token: string,
): Promise<StoreOutcome> {
  const search = new URLSearchParams(Object.entries(key).map(([name, value]) => [name, String(value)])).toString()
  const reply = await http.serviceChange(`/api/store/${encodeURIComponent(collection)}/record?${search}`, {
    method: 'DELETE',
    token,
  })
  return outcome(reply.status)
}
