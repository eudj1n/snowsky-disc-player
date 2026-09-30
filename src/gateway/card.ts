/**
 * The card in one request (service combined-009, the owner's proposal): one
 * folder (`/api/card/folder/<folder>`) or the whole tree with each audio
 * file's facts (`/api/card/tree`), read by the service from the card itself
 * instead of stock's transfer browser page by page and one media read per
 * file. Hidden names are never listed. Both answer null on an image without
 * them (404), so callers fall back to the earlier reads.
 */
import type { CardKind, FolderEntry } from '../domain/files'
import { folderParts } from '../domain/files'
import type { FileFacts } from '../domain/space'
import type { GatewayHttp } from './http'

const KINDS: readonly CardKind[] = ['audio', 'lyrics', 'image', 'cue', 'playlist', 'other']
const kindOf = (value: unknown): CardKind => (KINDS.includes(value as CardKind) ? (value as CardKind) : 'other')
const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null

/** The folder in the route: each part percent-encoded below the card root ('' is the root). */
const folderRoute = (base: string, folder: string) =>
  [base, ...folderParts(folder).map((part) => encodeURIComponent(part))].join('/')

export interface CardFolder {
  entries: FolderEntry[]
  truncated: boolean
}

/** One folder as the service lists it, sorted by name; null where the image has no such route. */
export async function readCardFolder(http: GatewayHttp, folder: string): Promise<CardFolder | null> {
  const value = (await http.serviceRead(folderRoute('/api/card/folder', folder))) as Record<string, unknown> | null
  if (value === null) return null
  if (!Array.isArray(value.entries)) throw new SyntaxError('Card folder listing')
  const entries = (value.entries as Record<string, unknown>[]).flatMap((item): FolderEntry[] => {
    if (typeof item.name !== 'string' || item.name === '' || item.name.includes('/')) return []
    const folder = item.dir === true
    const kind = folder ? null : kindOf(item.kind)
    return [
      {
        name: item.name,
        folder,
        image: kind === 'image',
        cue: kind === 'cue',
        playlist: kind === 'playlist',
        kind,
        bytes: folder ? null : typeof item.bytes === 'number' ? item.bytes : null,
      },
    ]
  })
  return { entries, truncated: value.truncated === true }
}

export interface CardFile {
  /** The card path, as the library spells it ('/tmp/sdcard/…'). */
  path: string
  bytes: number
  kind: CardKind
  /** An audio file's facts from its headers. */
  audio: (FileFacts & { durationMs: number | null; year: number | null }) | null
}

export interface CardTree {
  files: CardFile[]
  folders: number
  bytes: number
  /** A walk cut at the service's bounds: files missing from it may still be on the card. */
  truncated: boolean
}

/** The whole card below its root in one walk; null where the image has no such route. */
export async function readCardTree(http: GatewayHttp): Promise<CardTree | null> {
  const value = (await http.serviceRead('/api/card/tree')) as Record<string, unknown> | null
  if (value === null) return null
  if (typeof value.root !== 'string' || !Array.isArray(value.entries)) throw new SyntaxError('Card tree')
  const root = value.root.replace(/\/$/, '')
  const files = (value.entries as Record<string, unknown>[]).flatMap((item): CardFile[] => {
    if (item.dir === true || typeof item.path !== 'string' || item.path === '') return []
    const kind = kindOf(item.kind)
    const bytes = typeof item.bytes === 'number' ? item.bytes : 0
    const format = typeof item.format === 'string' ? item.format : null
    const year = typeof item.year === 'string' ? Number(item.year) : count(item.year)
    return [
      {
        path: `${root}/${item.path}`,
        bytes,
        kind,
        audio:
          kind === 'audio' && format !== null
            ? {
                bytes,
                format,
                sampleRate: count(item.sampleRate),
                bitDepth: count(item.bitDepth),
                bitRate: count(item.bitRate),
                channels: count(item.channels),
                durationMs: count(item.durationMs),
                year: year !== null && Number.isInteger(year) && year > 0 ? year : null,
              }
            : null,
      },
    ]
  })
  return {
    files,
    folders: count(value.folders) ?? 0,
    bytes: count(value.bytes) ?? 0,
    truncated: value.truncated === true,
  }
}
