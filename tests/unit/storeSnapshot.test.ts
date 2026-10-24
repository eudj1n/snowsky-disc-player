import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError, type GatewayHttp } from '../../src/gateway/http'

const cache = vi.hoisted(() => new Map<string, unknown>())
vi.mock('../../src/lib/idb', () => ({
  cacheGet: (key: string) => Promise.resolve(cache.get(key)),
  cacheSet: (key: string, value: unknown) => {
    cache.set(key, value)
    return Promise.resolve()
  },
}))
const { readCollectionSnapshot, forgetSinceRefusal, SETTLE_MS } = await import('../../src/stores/storeSnapshot')

const row = (name: string, updated: number, at = 1) => ({ key: [name], value: { source: name, at }, updated })

describe("the store's snapshot", () => {
  const asked: string[] = []
  let rows = [row('a', 10), row('b', 20)]
  /** The service predates `since` and refuses it. */
  let oldService = false
  const http = {
    serviceRead: (path: string) => {
      asked.push(path)
      const url = new URL(path, 'http://x')
      if (url.pathname.endsWith('/gone/records')) return Promise.resolve(null)
      if (oldService && url.searchParams.has('since')) return Promise.reject(new HttpError(400, 'unknown parameter'))
      const since = Number(url.searchParams.get('since') ?? -1)
      const limit = Number(url.searchParams.get('limit') ?? 100)
      const kept = rows.filter((record) => record.updated > since)
      const all = url.searchParams.get('order') === 'updated' ? [...kept].sort((a, b) => b.updated - a.updated) : kept
      return Promise.resolve({ records: all.slice(0, limit), total: kept.length, truncated: false })
    },
  } as unknown as GatewayHttp
  const HEAD = '/api/store/external_sources/records?order=updated&desc=1&limit=1'
  const WHOLE = '/api/store/external_sources/records?limit=500&offset=0'
  const since = (seconds: number) => `${WHOLE}&since=${String(seconds)}`
  beforeEach(() => {
    asked.length = 0
    cache.clear()
    rows = [row('a', 10), row('b', 20)]
    oldService = false
    forgetSinceRefusal()
    vi.useFakeTimers()
    vi.setSystemTime(1_790_000_000_000)
  })
  afterEach(() => vi.useRealTimers())
  /** The snapshot settles: time enough for a write in the newest record's second to be past. */
  const settle = () => vi.setSystemTime(Date.now() + SETTLE_MS)

  it('reads the collection whole once, then takes the snapshot while the newest record and the total hold', async () => {
    expect(await readCollectionSnapshot(http, 'external_sources')).toEqual(rows)
    expect(asked).toEqual([HEAD, WHOLE])
    // Within two seconds of the snapshot a write in the same second could hide: ask for the changes since then.
    asked.length = 0
    expect(await readCollectionSnapshot(http, 'external_sources')).toEqual(rows)
    expect(asked).toEqual([HEAD, since(19)])
    settle()
    asked.length = 0
    expect(await readCollectionSnapshot(http, 'external_sources')).toEqual(rows)
    expect(asked).toEqual([HEAD])
  })

  it('reads the changes alone after a write, laid over the kept records by key', async () => {
    await readCollectionSnapshot(http, 'external_sources')
    settle()
    rows = [row('a', 10), row('b', 30, 2), row('c', 31)]
    asked.length = 0
    expect(await readCollectionSnapshot(http, 'external_sources')).toEqual(rows)
    expect(asked).toEqual([HEAD, since(19)])
    settle()
    // The merged snapshot holds, with the newest the player names.
    asked.length = 0
    expect(await readCollectionSnapshot(http, 'external_sources')).toEqual(rows)
    expect(asked).toEqual([HEAD])
  })

  it('reads whole after a removal, which the changes cannot name, even with a write beside it', async () => {
    await readCollectionSnapshot(http, 'external_sources')
    settle()
    rows = [row('b', 20)]
    asked.length = 0
    expect(await readCollectionSnapshot(http, 'external_sources')).toEqual(rows)
    expect(asked).toEqual([HEAD, since(19), WHOLE])
    settle()
    rows = [row('c', 40)]
    asked.length = 0
    expect(await readCollectionSnapshot(http, 'external_sources')).toEqual(rows)
    expect(asked).toEqual([HEAD, since(19), WHOLE])
  })

  it('reads whole on a service before since, and asks it about since once a page load', async () => {
    oldService = true
    await readCollectionSnapshot(http, 'external_sources')
    settle()
    rows = [row('a', 10), row('b', 30)]
    asked.length = 0
    expect(await readCollectionSnapshot(http, 'external_sources')).toEqual(rows)
    expect(asked).toEqual([HEAD, since(19), WHOLE])
    settle()
    rows = [row('a', 10), row('b', 40)]
    asked.length = 0
    expect(await readCollectionSnapshot(http, 'external_sources')).toEqual(rows)
    expect(asked).toEqual([HEAD, WHOLE])
    // A new connection asks again.
    forgetSinceRefusal()
    oldService = false
    settle()
    rows = [row('a', 10), row('b', 50)]
    asked.length = 0
    expect(await readCollectionSnapshot(http, 'external_sources')).toEqual(rows)
    expect(asked).toEqual([HEAD, since(39)])
  })

  it('answers null without the collection, and keeps an empty one as empty', async () => {
    expect(await readCollectionSnapshot(http, 'gone')).toBeNull()
    rows = []
    expect(await readCollectionSnapshot(http, 'external_sources')).toEqual([])
    settle()
    asked.length = 0
    expect(await readCollectionSnapshot(http, 'external_sources')).toEqual([])
    expect(asked).toHaveLength(1)
    // An empty snapshot grows by the changes: everything, since its newest is nothing.
    rows = [row('a', 10)]
    asked.length = 0
    expect(await readCollectionSnapshot(http, 'external_sources')).toEqual(rows)
    expect(asked).toEqual([HEAD, since(0)])
  })
})
