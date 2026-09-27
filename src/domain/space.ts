/**
 * What takes space on the card (owner, round 16): the collection's files as
 * the service's media route measured them, by format, album and artist, and
 * possible duplicates. Only files the stock library indexed are known here;
 * the rest of the used space counts as other files. The page never deletes:
 * the service denies stock's file deletion, so the owner removes a copy in
 * USB storage mode.
 */
import type { Album } from './album'
import type { LibraryTrack } from './track'

/** One measured file: the media route's format (its lower-case extension), size and quality. */
export interface FileFacts {
  bytes: number
  format: string
  sampleRate: number | null
  bitDepth: number | null
  bitRate: number | null
}

const LOSSLESS = new Set(['flac', 'wav', 'aif', 'aiff', 'ape', 'wv', 'alac', 'dsf', 'dff'])
const DSD = new Set(['dsf', 'dff'])

/** A format as the owner compares them: "FLAC", "FLAC Hi-Res", "MP3", "AAC", "ALAC", "DSD". */
export function formatGroup(file: Pick<FileFacts, 'format' | 'sampleRate' | 'bitDepth' | 'bitRate'>): {
  label: string
  lossless: boolean
} {
  const extension = file.format.toLowerCase()
  if (DSD.has(extension)) return { label: 'DSD', lossless: true }
  // An MP4 file holds AAC (it has a bitrate) or ALAC (a bit depth and no bitrate).
  const name =
    extension === 'm4a' || extension === 'mp4'
      ? file.bitRate !== null
        ? 'AAC'
        : file.bitDepth !== null
          ? 'ALAC'
          : 'M4A'
      : extension.toUpperCase()
  const lossless = LOSSLESS.has(extension) || name === 'ALAC'
  const hiRes = lossless && ((file.sampleRate ?? 0) > 48_000 || (file.bitDepth ?? 0) > 16)
  return { label: hiRes ? `${name} Hi-Res` : name, lossless }
}

export interface FormatShare {
  label: string
  lossless: boolean
  bytes: number
  files: number
}

/** Measured files by format, largest first. */
export function byFormat(files: readonly FileFacts[]): FormatShare[] {
  const groups = new Map<string, FormatShare>()
  for (const file of files) {
    const { label, lossless } = formatGroup(file)
    const group = groups.get(label) ?? { label, lossless, bytes: 0, files: 0 }
    group.bytes += file.bytes
    group.files++
    groups.set(label, group)
  }
  return [...groups.values()].sort((a, b) => b.bytes - a.bytes)
}

export interface AlbumSpace {
  album: Album
  /** Bytes of its measured files. */
  bytes: number
  /** Distinct files (a CUE sheet is one), and how many of them are measured. */
  files: number
  measured: number
  /** Format labels of its measured files, most bytes first. */
  formats: string[]
  /** Plays of its tracks in the history the service keeps. */
  plays: number
}

/** Albums by the space their measured files take, largest first. */
export function albumSpace(
  albums: readonly Album[],
  tracks: readonly LibraryTrack[],
  files: Readonly<Record<string, FileFacts>>,
  plays: ReadonlyMap<string, number>,
): AlbumSpace[] {
  const byId = new Map(tracks.map((track) => [track.id, track]))
  return albums
    .map((album) => {
      // A CUE sheet's tracks share one file: it is counted once.
      const members = [
        ...new Set(
          album.ids.flatMap((id) => {
            const track = byId.get(id)
            return track?.path ? [track.path] : []
          }),
        ),
      ]
      const measured = members.flatMap((path) => (files[path] ? [files[path]] : []))
      return {
        album,
        bytes: measured.reduce((sum, file) => sum + file.bytes, 0),
        files: members.length,
        measured: measured.length,
        formats: byFormat(measured).map((share) => share.label),
        plays: members.reduce((sum, path) => sum + (plays.get(path) ?? 0), 0),
      }
    })
    .sort((a, b) => b.bytes - a.bytes)
}

export interface ArtistSpace {
  /** The album's lead artist; null gathers compilations and albums without one. */
  name: string | null
  bytes: number
  albums: number
}

/** Artists by the space of their albums (each album counted once, under its lead). */
export function artistSpace(albums: readonly AlbumSpace[], leadOf: (album: Album) => string | null): ArtistSpace[] {
  const groups = new Map<string | null, ArtistSpace>()
  for (const entry of albums) {
    const name = leadOf(entry.album)
    const group = groups.get(name) ?? { name, bytes: 0, albums: 0 }
    group.bytes += entry.bytes
    group.albums++
    groups.set(name, group)
  }
  return [...groups.values()].sort((a, b) => b.bytes - a.bytes)
}

/** Title or credit reduced for comparison: case, track numbers, extensions and punctuation dropped. */
export function comparable(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/, '')
    .replace(/^\d{1,3}[\s._)-]+/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export interface DuplicateCopy {
  folder: string
  bytes: number
  formats: string[]
}

/** The same tracks in two folders: how many, and what each copy takes. */
export interface DuplicatePair {
  tracks: number
  copies: [DuplicateCopy, DuplicateCopy]
}

const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/'))
/** Durations further apart than this are different recordings (a live take, an edit). */
const SAME_LENGTH_MS = 2000

/**
 * Possible duplicates: tracks with the same title and credit in different
 * folders whose lengths agree (when both are known), grouped by the pair of
 * folders and ordered by what removing the smaller copy would free.
 */
export function duplicates(
  tracks: readonly LibraryTrack[],
  files: Readonly<Record<string, FileFacts>>,
): DuplicatePair[] {
  const groups = new Map<string, LibraryTrack[]>()
  for (const track of tracks) {
    if (!track.path) continue
    const title = comparable(track.title)
    if (!title) continue
    const key = `${title}\u0000${comparable(track.albumArtist ?? track.artist ?? '')}`
    groups.set(key, [...(groups.get(key) ?? []), track])
  }
  type Side = { bytes: number; files: FileFacts[] }
  const pairs = new Map<string, { tracks: number; sides: Map<string, Side> }>()
  for (const members of groups.values()) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i]
        const b = members[j]
        if (!a?.path || !b?.path) continue
        const [first, second] = [folderOf(a.path), folderOf(b.path)]
        if (first === second) continue
        if (a.durationMs !== null && b.durationMs !== null && Math.abs(a.durationMs - b.durationMs) > SAME_LENGTH_MS)
          continue
        const ordered = first < second ? [a, b] : [b, a]
        const key = JSON.stringify(ordered.map((track) => folderOf(track.path ?? '')))
        const pair = pairs.get(key) ?? { tracks: 0, sides: new Map<string, Side>() }
        pair.tracks++
        for (const track of ordered) {
          const folder = folderOf(track.path ?? '')
          const side = pair.sides.get(folder) ?? { bytes: 0, files: [] }
          const file = track.path ? files[track.path] : undefined
          if (file) {
            side.bytes += file.bytes
            side.files.push(file)
          }
          pair.sides.set(folder, side)
        }
        pairs.set(key, pair)
      }
    }
  }
  const result: DuplicatePair[] = []
  for (const [key, pair] of pairs) {
    const [first, second] = JSON.parse(key) as [string, string]
    const copy = (folder: string): DuplicateCopy => {
      const side = pair.sides.get(folder)
      return {
        folder,
        bytes: side?.bytes ?? 0,
        formats: byFormat(side?.files ?? []).map((share) => share.label),
      }
    }
    result.push({ tracks: pair.tracks, copies: [copy(first), copy(second)] })
  }
  const freed = (pair: DuplicatePair) => Math.min(pair.copies[0].bytes, pair.copies[1].bytes)
  return result.sort((a, b) => freed(b) - freed(a) || b.tracks - a.tracks)
}

/** Used space split into the measured music and everything else on the card. */
export function cardUsage(
  card: { totalBytes: number; freeBytes: number } | null,
  music: number,
): { total: number; free: number; music: number; other: number } | null {
  if (!card || !(card.totalBytes > 0)) return null
  const free = Math.min(Math.max(card.freeBytes, 0), card.totalBytes)
  const used = card.totalBytes - free
  const counted = Math.min(music, used)
  return { total: card.totalBytes, free, music: counted, other: used - counted }
}

/** Plays per file path in the kept history, and when that history begins (seconds). */
export function playsByPath(plays: readonly { path: string; at: number }[]): {
  counts: Map<string, number>
  since: number | null
} {
  const counts = new Map<string, number>()
  let since: number | null = null
  for (const play of plays) {
    counts.set(play.path, (counts.get(play.path) ?? 0) + 1)
    if (since === null || play.at < since) since = play.at
  }
  return { counts, since }
}
