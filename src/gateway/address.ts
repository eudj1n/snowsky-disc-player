/**
 * Where the gateway is (2026-09-30). The page on the card is same-origin with
 * it: API paths stay relative. A hosted build (VITE_HOSTED=1, the GitHub Pages
 * prototype) reaches the player on the local network by stock's own name,
 * ingenic.local, or an address the user gives. Chrome lets an HTTPS page call
 * a private address or a .local name only after the user allows local network
 * access (Local Network Access); the player admits the site's origin from its
 * reviewed hosted.json and still asks for the serial number for any change.
 */
import { readPreference, writePreference } from '../lib/storage'

export const hosted = import.meta.env.VITE_HOSTED === '1'
export const DEFAULT_GATEWAY = 'http://ingenic.local:7870'
const KEY = 'disc-player.gateway'

/** http://<host>[:port], nothing after it: a name (ingenic.local) or an IPv4 address. */
export function normalizeGateway(value: string): string | null {
  const text = value.trim().replace(/\/+$/, '')
  const withScheme = /^[a-z]+:\/\//i.test(text) ? text : `http://${text}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    return null
  return `http://${url.host}`
}

let base = hosted ? (normalizeGateway(readPreference(KEY) ?? '') ?? DEFAULT_GATEWAY) : ''

/** The hosted page's gateway ('' on the card, where paths are relative). */
export const gatewayBase = (): string => base

/** Remembers another gateway address for the hosted page; false when it is not one. */
export function setGatewayBase(value: string): boolean {
  const next = normalizeGateway(value)
  if (!next) return false
  base = next
  writePreference(KEY, next === DEFAULT_GATEWAY ? null : next)
  return true
}

/** An API path as this page reaches it. */
export const gatewayUrl = (path: string): string => base + path

/** The control channel's WebSocket address. */
export function gatewaySocketUrl(): string {
  if (base) return `${base.replace(/^http/, 'ws')}/api/websocket`
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/websocket`
}

/** fetch() for the gateway: the hosted page declares the local address space it calls. */
export function gatewayFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  if (!base || typeof input !== 'string' || !input.startsWith('/')) return fetch(input, init)
  return fetch(gatewayUrl(input), { ...init, targetAddressSpace: 'local' } as RequestInit)
}
