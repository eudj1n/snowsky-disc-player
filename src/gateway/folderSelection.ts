/**
 * Playing a card folder, as stock's own folder browser does (snowsky-disc-qemu
 * docs/protocol/library-browsing.md, confirmed on the physical V2.57 player):
 * `0101` + list type `0004` + the folder's absolute path plays it from its
 * first audio file (not its subfolders); `0100` + a four-digit position + the
 * same argument plays one file. Positions follow stock's playback browser
 * (`/localdir/…/`) and count subfolders too. The guarded sequence follows
 * selection.ts: two equal reads, one send, confirmation by the playing file.
 */
import { cardFolder, type FolderEntry } from '../domain/files'
import { isAudio } from '../domain/imports'
import type { GatewayHttp } from './http'
import { mergePlayback, playbackOf, readPlaybackWire, type PlaybackWire } from './playback'
import type { SelectionDeps, SelectionOutcome } from './selection'
import { NoObservation } from './session'

const PAGE = 200
const MAX_ROWS = 2000
/** Stock copies the folder into a 512-byte buffer with a trailing slash. */
const MAX_PATH_BYTES = 500
const encoder = new TextEncoder()
const hex4 = (value: number) => value.toString(16).toUpperCase().padStart(4, '0')

interface LocalRow extends FolderEntry {
  pos: number
}

/** Stock's playback browser for a folder, every page, in stock's order. */
export async function localRows(http: GatewayHttp, folder: string): Promise<LocalRow[]> {
  const route = `/localdir${cardFolder(folder)}`
  const rows: LocalRow[] = []
  for (let start = 0; start < MAX_ROWS; start += PAGE) {
    const response = await http.stockRead(route, { 'start-pos': String(start), 'num-max': String(PAGE) })
    const text = await response.text()
    const total = response.headers.get('total-num')
    if (total === null && text.trim() === '') break
    const page = JSON.parse(text) as unknown
    if (!Array.isArray(page)) throw new SyntaxError('Folder listing is not a list')
    for (const value of page) {
      const record = value as Record<string, unknown>
      if (typeof record.name !== 'string' || typeof record.pos !== 'number') throw new SyntaxError('Folder row')
      rows.push({
        pos: record.pos,
        name: record.name,
        folder: record.is_dir === true,
        image: record.is_image === true,
        cue: record.is_cue === true,
        playlist: record.is_m3u === true,
      })
    }
    if (page.length < PAGE || (total !== null && rows.length >= Number(total))) break
  }
  return rows
}

/** A row stock plays as one file: audio, not a folder, image, CUE sheet or playlist. */
export const playable = (row: FolderEntry) =>
  !row.folder && !row.image && !row.cue && !row.playlist && isAudio(row.name)

const same = (a: readonly LocalRow[], b: readonly LocalRow[]) =>
  a.length === b.length &&
  a.every((row, index) => {
    const other = b[index]
    return other !== undefined && row.name === other.name && row.pos === other.pos && row.folder === other.folder
  })

/** The folder argument stock takes: its absolute path without a trailing slash. */
export function folderArgument(folder: string): string | null {
  const path = cardFolder(folder).replace(/\/$/, '')
  if (/\.m3u/i.test(path) || encoder.encode(path).length > MAX_PATH_BYTES) return null
  return path
}

export async function selectFolder(deps: SelectionDeps, folder: string, file?: string): Promise<SelectionOutcome> {
  const { session, http, timeoutMs } = deps
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)))
  const argument = folderArgument(folder)
  if (!argument) return 'unavailable'
  let rows: LocalRow[]
  let wanted: LocalRow | undefined
  try {
    rows = await localRows(http, folder)
    const again = await localRows(http, folder)
    if (!rows.length || !same(rows, again)) return 'changed'
    if (file !== undefined) {
      const matches = rows.filter((row) => row.name === file)
      if (matches.length > 1) return 'ambiguous'
      wanted = matches[0]
      if (!wanted || !playable(wanted)) return 'changed'
    } else {
      wanted = rows.find(playable)
      if (!wanted) return 'unavailable'
    }
    // Preflight right before the send: the folder still reads the same.
    if (!same(await localRows(http, folder), rows)) return 'changed'
  } catch {
    return 'changed'
  }
  try {
    deps.guard?.()
  } catch {
    return 'unavailable'
  }
  deps.attempted?.()
  const outcome =
    file === undefined
      ? await session.mutate('0101', `0004${argument}`, null, timeoutMs)
      : await session.mutate('0100', `${hex4(wanted.pos)}0004${argument}`, null, timeoutMs)
  if (outcome.status === 'unsent') return 'unavailable'
  const expected = `${argument}/${wanted.name}`
  const deadline = now() + (deps.confirmMs ?? 8000)
  let seen: PlaybackWire = {}
  while (now() < deadline && session.open) {
    try {
      seen = mergePlayback(seen, await readPlaybackWire(session))
      const observed = playbackOf(seen)
      if (observed.state === 'playing' && observed.source === 'folder' && observed.track?.path === expected)
        return 'playing'
    } catch (error) {
      if (!(error instanceof NoObservation)) break
    }
    await sleep(deps.pauseMs ?? 150)
  }
  return 'uncertain'
}
