/**
 * The service's M3U lists (combined-009, `/api/lists/<scope>`): files stock
 * plays by their path. `external` lists sit in the visible `Playlists/`
 * folder, where the player's own file browser opens and plays them; the page
 * keeps its automatic playlists there. A list is written whole (the service
 * writes a temporary file, reads it back and renames it over the list), each
 * entry an existing music file on the card. Reads need no credential; a
 * change carries the serial number and a fresh request ID and is never
 * retried.
 */
import type { GatewayHttp } from './http'

export type ListScope = 'internal' | 'external'

export interface ListFile {
  name: string
  /** The list's card path ('/tmp/sdcard/Playlists/<name>.m3u'), which stock plays. */
  path: string
  bytes: number
  modified: number
}

export interface ListContent {
  name: string
  path: string
  /** Absolute card paths, in order. */
  entries: string[]
}

const route = (scope: ListScope, name?: string) =>
  `/api/lists/${scope}${name === undefined ? '' : `/${encodeURIComponent(name)}`}`

/** The scope's lists by name; null where the image keeps no such lists. */
export async function readLists(http: GatewayHttp, scope: ListScope): Promise<ListFile[] | null> {
  const value = (await http.serviceRead(route(scope))) as { lists?: unknown } | null
  if (value === null) return null
  if (!Array.isArray(value.lists)) throw new SyntaxError('List folder')
  return (value.lists as Record<string, unknown>[]).flatMap((item) =>
    typeof item.name === 'string' && typeof item.path === 'string'
      ? [
          {
            name: item.name,
            path: item.path,
            bytes: typeof item.bytes === 'number' ? item.bytes : 0,
            modified: typeof item.modified === 'number' ? item.modified : 0,
          },
        ]
      : [],
  )
}

/** One list with its entries; null when there is no such list. */
export async function readList(http: GatewayHttp, scope: ListScope, name: string): Promise<ListContent | null> {
  const value = (await http.serviceRead(route(scope, name))) as Record<string, unknown> | null
  if (value === null) return null
  if (typeof value.path !== 'string' || !Array.isArray(value.entries)) throw new SyntaxError('List')
  return {
    name: typeof value.name === 'string' ? value.name : name,
    path: value.path,
    entries: (value.entries as unknown[]).flatMap((entry) => (typeof entry === 'string' ? [entry] : [])),
  }
}

/**
 * - `written`: the service wrote (or replaced) the list and read it back.
 * - `refused`: nothing was written (an entry not on the card, a bad name, a scan in progress).
 * - `full`: 200 lists already (409), too many entries (413) or a card too full (507).
 * - `uncertain`: no answer; the list may or may not have changed.
 */
export type ListOutcome = 'written' | 'refused' | 'full' | 'uncertain'

/** Writes or replaces one list whole. */
export async function writeList(
  http: GatewayHttp,
  token: string,
  scope: ListScope,
  name: string,
  entries: readonly string[],
): Promise<ListOutcome> {
  try {
    const reply = await http.serviceChange(route(scope, name), { method: 'PUT', token, body: { entries } })
    if (reply.status === 200 || reply.status === 201) return 'written'
    if ([409, 413, 507].includes(reply.status)) return 'full'
    return reply.status >= 400 && reply.status < 500 ? 'refused' : 'uncertain'
  } catch {
    return 'uncertain'
  }
}

/** Deletes one list; one already gone counts as deleted. */
export async function deleteList(
  http: GatewayHttp,
  token: string,
  scope: ListScope,
  name: string,
): Promise<'deleted' | 'refused' | 'uncertain'> {
  try {
    const reply = await http.serviceChange(route(scope, name), { method: 'DELETE', token })
    if (reply.status === 200 || reply.status === 404) return 'deleted'
    return reply.status >= 400 && reply.status < 500 ? 'refused' : 'uncertain'
  } catch {
    return 'uncertain'
  }
}
