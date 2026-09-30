/**
 * The reviewed catalogs the service works with (combined-009: the image's,
 * or the card's override where admitted), read at /api/contract/:
 * compatibility.json (the firmware identity) and commands.json (the command
 * catalog); and the app's own origins.json beside its index.html.
 *
 * In a build every script lives in <app>/assets/, so the app's folder is one
 * level above this module, whether it is served at / or at /apps/<App>/. In
 * development the Vite proxy serves the gateway's Disc Player origins.json
 * (see vite.config.ts).
 */
import { gatewayUrl } from './address'
export interface Compatibility {
  schema: number
  api: number
  protocol_identity: string
  main_os_version: number
  profile_sha256: string
}

export interface CatalogRecord {
  name: string
  kind: 'read' | 'mutation'
  class: string
  payload: string
  reply: string | null
  silent_ok: boolean
  timeout_ms: number
  pacing_ms: number
  max_bytes: number
}

export interface CatalogRoute {
  name: string
  method: string
  path: string
  kind: 'read' | 'mutation'
  max_body_bytes: number
  /** Admitted header patterns (for capability checks such as favorites removal). */
  headers?: Record<string, string>
}

export interface CommandCatalog {
  api: number
  version: string
  profile_sha256: string
  catalog_sha256: string
  records: Record<string, CatalogRecord>
  http?: CatalogRoute[]
  /** Built-in data mutations the card admits by name (next image), e.g. favorite_add. */
  data?: { name: string; class: string; pacing_ms: number }[]
}

const PARENT = '..'

function appRoot(): URL {
  return import.meta.env.DEV ? new URL('/', location.href) : new URL(PARENT + '/', import.meta.url)
}

async function json<T>(url: URL | string, name: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
  return (await response.json()) as T
}

const contractJson = <T>(name: string): Promise<T> => json<T>(gatewayUrl(`/api/contract/${name}`), name)

/** One reviewed external origin of the app (its origins.json). */
export interface ReleaseOrigin {
  origin: string
  directives: string[]
}

/**
 * The app's reviewed external origins, which the service adds to its policy;
 * null when it has none (the app stays same-origin).
 */
export async function loadOrigins(): Promise<Record<string, ReleaseOrigin> | null> {
  try {
    const catalog = await json<{ origins?: Record<string, ReleaseOrigin> }>(
      new URL('origins.json', appRoot()),
      'origins.json',
    )
    return catalog.origins && typeof catalog.origins === 'object' ? catalog.origins : null
  } catch {
    return null
  }
}

export const loadCompatibility = (): Promise<Compatibility> => contractJson<Compatibility>('compatibility.json')
export const loadCommands = (): Promise<CommandCatalog> => contractJson<CommandCatalog>('commands.json')

/** Whether the connected player matches the reviewed profile of the image serving the app. */
export function isCompatible(profile: Compatibility, handshake: string, socVersion: number | null): boolean {
  return (
    profile.schema === 1 &&
    profile.api === 1 &&
    /^[0-9a-f]{4}$/.test(profile.protocol_identity) &&
    Number.isInteger(profile.main_os_version) &&
    profile.main_os_version > 0 &&
    /^[0-9a-f]{64}$/.test(profile.profile_sha256) &&
    handshake === profile.protocol_identity &&
    socVersion === profile.main_os_version
  )
}
