import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GatewayHttp } from '../../src/gateway/http'

const cache = vi.hoisted(() => new Map<string, unknown>())
vi.mock('../../src/lib/idb', () => ({
  cacheGet: (key: string) => Promise.resolve(cache.get(key)),
  cacheSet: (key: string, value: unknown) => {
    cache.set(key, value)
    return Promise.resolve()
  },
}))
const { readCollectionSnapshot, SETTLE_MS } = await import('../../src/stores/storeSnapshot')

const row = (name: string, updated: number) => ({ key: [name], value: { source: name, at: 1 }, updated })

describe("the store's snapshot", () => {
  const asked: string[] = []
  let rows = [row('a', 10), row('b', 20)]
  const http = {
    serviceRead: (path: string) => {
      asked.push(path)
      const url = new URL(path, 'http://x')
      if (url.pathname.endsWith('/gone/records')) return Promise.resolve(null)
      const limit = Number(url.searchParams.get('limit') ?? 100)
      const all = url.searchParams.get('order') === 'updated' ? [...rows].sort((a, b) => b.updated - a.updated) : rows
      return Promise.resolve({ records: all.slice(0, limit), total: rows.length, truncated: false })
    },
  } as unknown as GatewayHttp
  beforeEach(() => {
    asked.length = 0
    cache.clear()
    rows = [row('a', 10), row('b', 20)]
    vi.useFakeTimers()
    vi.setSystemTime(1_790_000_000_000)
  })
  afterEach(() => vi.useRealTimers())
  /** The snapshot settles: time enough for a write in the newest record's second to be past. */
  const settle = () => vi.setSystemTime(Date.now() + SETTLE_MS)

  it('reads the collection whole once, then takes the snapshot while the newest record and the total hold', async () => {
    expect(await readCollectionSnapshot(http, 'external_sources')).toEqual(rows)
    expect(asked).toEqual([
      '/api/store/external_sources/records?order=updated&desc=1&limit=1',
      '/api/store/external_sources/records?limit=500&offset=0',
    ])
    // Within two seconds of the snapshot a write in the same second could hide: read whole again.
    asked.length = 0
    expect(await readCollectionSnapshot(http, 'external_sources')).toEqual(rows)
    expect(asked).toHaveLength(2)
    settle()
    asked.length = 0
    expect(await readCollectionSnapshot(http, 'external_sources')).toEqual(rows)
    expect(asked).toEqual(['/api/store/external_sources/records?order=updated&desc=1&limit=1'])
  })

  it('reads again after a write (a newer record) or a removal (another total)', async () => {
    await readCollectionSnapshot(http, 'external_sources')
    settle()
    rows = [row('a', 10), row('b', 30)]
    expect(await readCollectionSnapshot(http, 'external_sources')).toEqual(rows)
    expect(asked.filter((path) => path.includes('limit=500'))).toHaveLength(2)
    settle()
    rows = [row('b', 30)]
    expect(await readCollectionSnapshot(http, 'external_sources')).toEqual(rows)
    expect(asked.filter((path) => path.includes('limit=500'))).toHaveLength(3)
  })

  it('answers null without the collection, and keeps an empty one as empty', async () => {
    expect(await readCollectionSnapshot(http, 'gone')).toBeNull()
    rows = []
    expect(await readCollectionSnapshot(http, 'external_sources')).toEqual([])
    settle()
    asked.length = 0
    expect(await readCollectionSnapshot(http, 'external_sources')).toEqual([])
    expect(asked).toHaveLength(1)
  })
})
