/**
 * The service's trash and macOS leftovers (combined-008). Reads need no
 * credential; each change carries the serial number, is confirmed by the
 * service's own reply (it moved the files) and is never retried. The library
 * changes only with the next scan, which the caller offers.
 */
import { parseLeftovers, parseTrash, type Leftovers, type TrashListing } from '../domain/trash'
import type { GatewayHttp } from './http'

export async function readTrash(http: GatewayHttp): Promise<TrashListing | null> {
  const value = await http.serviceRead('/api/trash')
  return value === null ? null : parseTrash(value)
}

export async function readLeftovers(http: GatewayHttp): Promise<Leftovers | null> {
  const value = await http.serviceRead('/api/card/leftovers')
  return value === null ? null : parseLeftovers(value)
}

export interface TrashReply {
  status: number
  /** The service's one-line reason when it refused (the player holds it, the name is taken...). */
  problem: string | null
  body: Record<string, unknown> | null
}

async function change(
  http: GatewayHttp,
  path: string,
  method: 'POST' | 'DELETE',
  token: string,
  body?: unknown,
): Promise<TrashReply> {
  const reply = await http.serviceChange(path, { method, token, ...(body === undefined ? {} : { body }) })
  const object = reply.body && typeof reply.body === 'object' ? (reply.body as Record<string, unknown>) : null
  return {
    status: reply.status,
    problem: typeof reply.body === 'string' ? reply.body.trim() || null : null,
    body: object,
  }
}

export const moveToTrash = (http: GatewayHttp, path: string, token: string) =>
  change(http, '/api/trash', 'POST', token, { path })
export const restoreFromTrash = (http: GatewayHttp, id: number, token: string) =>
  change(http, `/api/trash/${String(id)}/restore`, 'POST', token)
export const purgeFromTrash = (http: GatewayHttp, id: number, token: string) =>
  change(http, `/api/trash/${String(id)}`, 'DELETE', token)
export const emptyTrash = (http: GatewayHttp, token: string) => change(http, '/api/trash', 'DELETE', token)
export const trashLeftovers = (http: GatewayHttp, token: string) =>
  change(http, '/api/card/leftovers/trash', 'POST', token)
