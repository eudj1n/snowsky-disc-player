// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

async function load(hosted: boolean) {
  vi.resetModules()
  vi.stubEnv('VITE_HOSTED', hosted ? '1' : '')
  return import('../../src/gateway/address')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  localStorage.removeItem('disc-player.gateway')
})

describe('gateway address', () => {
  it('takes a name or an IPv4 address with an optional port, nothing else', async () => {
    const { normalizeGateway } = await load(true)
    expect(normalizeGateway('ingenic.local:7870')).toBe('http://ingenic.local:7870')
    expect(normalizeGateway(' http://192.168.1.20:7870/ ')).toBe('http://192.168.1.20:7870')
    expect(normalizeGateway('192.168.1.20')).toBe('http://192.168.1.20')
    for (const bad of [
      'https://ingenic.local',
      'ingenic.local/apps',
      'http://user@ingenic.local',
      'ingenic.local?x=1',
      'ftp://x',
      '',
    ])
      expect(normalizeGateway(bad), bad).toBeNull()
  })

  it('keeps the card page same-origin', async () => {
    const address = await load(false)
    const fetch = vi.fn(() => Promise.resolve(new Response('{}')))
    vi.stubGlobal('fetch', fetch)
    expect(address.hosted).toBe(false)
    expect(address.gatewayUrl('/api/health')).toBe('/api/health')
    await address.gatewayFetch('/api/health', { cache: 'no-store' })
    expect(fetch).toHaveBeenCalledWith('/api/health', { cache: 'no-store' })
  })

  it('sends the hosted page to the player on the local network, declaring it', async () => {
    const address = await load(true)
    const fetch = vi.fn(() => Promise.resolve(new Response('{}')))
    vi.stubGlobal('fetch', fetch)
    expect(address.gatewayBase()).toBe(address.DEFAULT_GATEWAY)
    expect(address.gatewaySocketUrl()).toBe('ws://ingenic.local:7870/api/websocket')
    await address.gatewayFetch('/api/health', { cache: 'no-store' })
    expect(fetch).toHaveBeenCalledWith('http://ingenic.local:7870/api/health', {
      cache: 'no-store',
      targetAddressSpace: 'local',
    })
    // The page's own files stay where they are.
    await address.gatewayFetch('https://example.org/origins.json')
    expect(fetch).toHaveBeenLastCalledWith('https://example.org/origins.json', {})
    // Another address is remembered; the default is not stored.
    expect(address.setGatewayBase('https://nope')).toBe(false)
    expect(address.setGatewayBase('192.168.1.20:7870')).toBe(true)
    expect(address.gatewayUrl('/api/health')).toBe('http://192.168.1.20:7870/api/health')
    expect(localStorage.getItem('disc-player.gateway')).toBe('http://192.168.1.20:7870')
    expect((await load(true)).gatewayBase()).toBe('http://192.168.1.20:7870')
    address.setGatewayBase('ingenic.local:7870')
    expect(localStorage.getItem('disc-player.gateway')).toBeNull()
  })
})
