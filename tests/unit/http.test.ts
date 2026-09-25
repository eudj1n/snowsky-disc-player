import { describe, expect, it } from 'vitest'
import { GatewayHttp, HttpError, rowsOf } from '../../src/gateway/http'
import { isCompatible } from '../../src/gateway/release'
import { playerLanguage, socVersion } from '../../src/gateway/settings'

function fakeFetch(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const impl = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString()
    calls.push({ url, init })
    const route = routes[url]
    if (!route) return Promise.resolve(new Response('not found', { status: 404 }))
    return Promise.resolve(
      new Response(typeof route.body === 'string' ? route.body : JSON.stringify(route.body), {
        status: route.status ?? 200,
      }),
    )
  }
  return { calls, impl: impl }
}

describe('gateway HTTP', () => {
  it('accepts only api 1 health', async () => {
    const ok = fakeFetch({
      '/api/health': { body: { service: 'disc-native-probe', api: 1, controlActive: false, readOnly: false } },
    })
    expect((await new GatewayHttp(ok.impl).health()).api).toBe(1)
    const future = fakeFetch({ '/api/health': { body: { api: 2 } } })
    await expect(new GatewayHttp(future.impl).health()).rejects.toBeInstanceOf(HttpError)
  })

  it('runs reviewed data queries with encoded parameters', async () => {
    const { impl, calls } = fakeFetch({
      '/api/data/tracks?limit=3&offset=0': {
        body: {
          query: 'tracks',
          columns: ['ID', 'PATH'],
          rows: [[1, '/tmp/sdcard/Ё.flac']],
          rows_returned: 1,
          truncated: false,
        },
      },
    })
    const result = await new GatewayHttp(impl).data('tracks', { limit: 3, offset: 0 })
    expect(rowsOf(result)).toEqual([{ ID: 1, PATH: '/tmp/sdcard/Ё.flac' }])
    expect(calls[0]?.url).toBe('/api/data/tracks?limit=3&offset=0')
    expect(() => new GatewayHttp(impl).data('../x')).toThrow(RangeError)
  })

  it('surfaces gateway refusals', async () => {
    const { impl } = fakeFetch({
      '/api/data/system_settings': { status: 403, body: 'No reviewed query catalog for this card\n' },
    })
    await expect(new GatewayHttp(impl).data('system_settings')).rejects.toMatchObject({ status: 403 })
  })

  it('percent-encodes stock routes and sends token and a fresh request ID on mutations', async () => {
    const { impl, calls } = fakeFetch({
      '/api/stock/dir/tmp/sdcard/%D0%9D%D0%BE%D0%B2%D0%B0%D1%8F%20%D0%BF%D0%B0%D0%BF%D0%BA%D0%B0': { body: '' },
    })
    const http = new GatewayHttp(impl)
    const { requestId } = await http.stockMutation('/dir/tmp/sdcard/Новая папка', {
      method: 'POST',
      token: 't'.repeat(43),
    })
    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers['X-Disc-Token']).toBe('t'.repeat(43))
    expect(headers['X-Disc-Request']).toBe(requestId)
    await expect(http.stockRead('/dir/tmp/sdcard//x')).rejects.toBeInstanceOf(RangeError)
    await expect(http.stockRead('/song_category_tree/?type=all')).rejects.toBeInstanceOf(RangeError)
  })
})

describe('release and settings', () => {
  const profile = { schema: 1, api: 1, protocol_identity: '0306', main_os_version: 257, profile_sha256: 'a'.repeat(64) }

  it('requires the reviewed handshake and main OS number', () => {
    expect(isCompatible(profile, '0306', 257)).toBe(true)
    expect(isCompatible(profile, '0307', 257)).toBe(false)
    expect(isCompatible(profile, '0306', 258)).toBe(false)
    expect(isCompatible({ ...profile, api: 2 }, '0306', 257)).toBe(false)
  })

  it('maps the stock language index', () => {
    const settings = (language: number) => ({
      query: 'system_settings',
      columns: ['LANGUAGE'],
      rows: [[language]],
      rows_returned: 1,
      truncated: false,
    })
    expect(playerLanguage(settings(2))).toBe('en')
    expect(playerLanguage(settings(9))).toBe('ru')
    expect(playerLanguage(settings(42))).toBeNull()
    expect(socVersion('{"soc_version":257,"currentVolume":40}')).toBe(257)
    expect(socVersion('{}')).toBeNull()
  })
})

describe('gateway busy answers', () => {
  it('retries a data read after 503 and gives up after two more tries', async () => {
    let calls = 0
    const http = new GatewayHttp(
      () => {
        calls++
        return Promise.resolve(
          calls < 3
            ? new Response('busy', { status: 503 })
            : new Response(JSON.stringify({ query: 'q', columns: [], rows: [], rows_returned: 0, truncated: false })),
        )
      },
      () => Promise.resolve(),
    )
    await expect(http.data('tracks')).resolves.toMatchObject({ rows_returned: 0 })
    expect(calls).toBe(3)
    const always = new GatewayHttp(
      () => Promise.resolve(new Response('busy', { status: 503 })),
      () => Promise.resolve(),
    )
    await expect(always.data('tracks')).rejects.toThrow('HTTP 503')
  })

  it('sends stock requests one at a time and never retries a mutation', async () => {
    let active = 0
    let peak = 0
    let mutations = 0
    const http = new GatewayHttp(async (_input, init) => {
      if (init?.method === 'POST') mutations++
      active++
      peak = Math.max(peak, active)
      await new Promise((done) => setTimeout(done, 5))
      active--
      return new Response(init?.method === 'POST' ? 'busy' : '[]', {
        status: init?.method === 'POST' ? 503 : 200,
        headers: { 'total-num': '0' },
      })
    })
    const reads = Promise.all([http.stockRead('/a/'), http.stockRead('/b/')])
    const write = http.stockMutation('/c/', { method: 'POST', token: 't'.repeat(43) })
    await reads
    expect((await write).response.status).toBe(503)
    expect(peak).toBe(1)
    expect(mutations).toBe(1)
  })
})
