/**
 * Card folders through stock's transfer browser, as the reference file
 * browser reads them (snowsky-disc-qemu docs/protocol/http-api.md):
 * `GET /dir/tmp/sdcard/…/` pages of at most 200 records with `total-num`;
 * an empty or missing folder answers an empty 200 without a count. Creating a
 * folder is `POST /dir/tmp/sdcard/…/Name` (a catalog-admitted mutation);
 * stock's 200 is no confirmation, so the parent is read again.
 */
import { cardFolder, type FolderEntry } from '../domain/files'
import { CARD_ROOT } from '../domain/imports'
import type { GatewayHttp } from './http'

const PAGE = 200
/** More entries than any card folder needs; a longer listing is cut. */
export const MAX_ENTRIES = 5000

export interface FolderListing {
  entries: FolderEntry[]
  /** The count stock reported; null for an empty (or missing) folder. */
  total: number | null
  truncated: boolean
}

function entry(value: unknown): FolderEntry | null {
  if (value === null || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.name !== 'string' || record.name === '' || record.name.includes('/')) return null
  return {
    name: record.name,
    folder: record.is_dir === true,
    image: record.is_image === true,
    cue: record.is_cue === true,
    playlist: record.is_m3u === true,
  }
}

/**
 * Stock keeps the folder it listed last and answers the same listing again
 * from memory (V2.57, emulator, 2026-09-28): a folder the service moved to or
 * from its trash still showed. Listing another folder first makes stock read
 * the card again; the service's `.disc` folder is always there. `fresh` asks
 * for that after the service changed the card behind stock's back.
 */
export async function listFolder(http: GatewayHttp, folder: string, fresh = false): Promise<FolderListing> {
  if (fresh) {
    await http.stockRead(`/dir${CARD_ROOT}.disc/`, { 'start-pos': '0', 'num-max': '1' }).catch(() => undefined)
  }
  const route = `/dir${cardFolder(folder)}`
  const entries: FolderEntry[] = []
  let total: number | null = null
  for (let start = 0; start < MAX_ENTRIES; start += PAGE) {
    const response = await http.stockRead(route, { 'start-pos': String(start), 'num-max': String(PAGE) })
    const header = response.headers.get('total-num')
    const text = await response.text()
    if (header === null && text.trim() === '') break
    total = header === null ? total : Number(header)
    const rows = JSON.parse(text) as unknown
    if (!Array.isArray(rows)) throw new SyntaxError('Folder listing is not a list')
    const page = rows.flatMap((row) => entry(row) ?? [])
    entries.push(...page)
    if (rows.length < PAGE || (total !== null && entries.length >= total)) break
  }
  return { entries, total, truncated: total !== null && total > entries.length }
}

export type FolderOutcome = 'created' | 'exists' | 'not-sent' | 'uncertain'

/** Creates one folder and confirms it by reading its parent again. */
export async function createFolder(
  http: GatewayHttp,
  token: string,
  parent: string,
  name: string,
): Promise<FolderOutcome> {
  let existed: boolean
  try {
    const { response } = await http.stockMutation(`/dir${cardFolder(parent)}${name}`, { method: 'POST', token })
    // Refused by the gateway (token, catalog, a replayed request ID, a scan): nothing reached stock.
    if ([401, 403, 409, 503].includes(response.status)) return 'not-sent'
    if (!response.ok) return 'uncertain'
    existed = response.headers.get('is-exist') === '1'
  } catch {
    return 'uncertain'
  }
  try {
    const listing = await listFolder(http, parent)
    const found = listing.entries.some((item) => item.folder && item.name === name)
    if (!found) return 'uncertain'
    return existed ? 'exists' : 'created'
  } catch {
    return 'uncertain'
  }
}
