/**
 * The card's folders as the file manager shows them (owner, round 16): the
 * service lists every visible file of a folder with its size (combined-009;
 * before it, stock's transfer browser listed music, covers and playlists);
 * the library adds what it knows about the music below a folder. Folders are
 * addressed relative to the card root ('' is the root itself).
 */
import { stockUnknown } from './album'
import type { FileFacts } from './space'
import { CARD_ROOT } from './imports'
import type { LibraryTrack } from './track'

/** What the service's card listing calls a file, by its extension (combined-009). */
export type CardKind = 'audio' | 'lyrics' | 'image' | 'cue' | 'playlist' | 'other'

/** One entry of a folder listing: the service's (combined-009) or stock's (`/dir/…`). */
export interface FolderEntry {
  name: string
  folder: boolean
  image: boolean
  cue: boolean
  playlist: boolean
  /** The service's kind of a file; absent in stock's listing and for folders. */
  kind?: CardKind | null
  /** The file's size from the service's listing; absent in stock's. */
  bytes?: number | null
}

/** A folder's parts from the card root: '' → [], 'A/B' → ['A', 'B']. */
export function folderParts(folder: string): string[] {
  return folder.split('/').filter((part) => part !== '')
}

/** The folder as a card path with a trailing slash, as stock lists it. */
export function cardFolder(folder: string): string {
  const parts = folderParts(folder)
  return parts.length ? `${CARD_ROOT}${parts.join('/')}/` : CARD_ROOT
}

/** A card path's folder relative to the card root ('/tmp/sdcard/A/B' → 'A/B'). */
export function relativeFolder(path: string): string {
  return path.startsWith(CARD_ROOT) ? folderParts(path.slice(CARD_ROOT.length)).join('/') : ''
}

export const joinFolder = (folder: string, name: string) => [...folderParts(folder), name].join('/')

/** Links above a folder: the card root, then each parent, the folder itself last. */
export function breadcrumbs(folder: string): { name: string | null; folder: string }[] {
  const parts = folderParts(folder)
  return [
    { name: null, folder: '' },
    ...parts.map((name, index) => ({ name, folder: parts.slice(0, index + 1).join('/') })),
  ]
}

// eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
const INVALID = /[\u0000-\u001f\u007f/\\]/
const encoder = new TextEncoder()

/**
 * The card's `Apps` folder holds the apps the gateway serves, this page among
 * them (combined-009): not the owner's music, so the file manager neither
 * shows it nor goes into it, and no folder is made there (owner, 2026-10-02;
 * FAT ignores case).
 */
export const inApps = (folder: string): boolean => folderParts(folder)[0]?.toLowerCase() === 'apps'

/**
 * Why a new folder name cannot be used, or null when it can. Since
 * combined-008 everything the service keeps lives in the hidden `.disc`
 * folder and the service refuses any change below a hidden folder; FAT
 * forbids a trailing dot or space and some symbols.
 */
export function folderNameProblem(name: string, parent: string): 'empty' | 'reserved' | 'invalid' | null {
  if (name.trim() === '') return 'empty'
  if (
    INVALID.test(name) ||
    /[<>:"|?*]/.test(name) ||
    name !== name.trim() ||
    name.endsWith('.') ||
    name === '.' ||
    name === '..' ||
    encoder.encode(name).length > 240 ||
    encoder.encode(cardFolder(joinFolder(parent, name))).length > 1000
  )
    return 'invalid'
  if ([...folderParts(parent), name].some((part) => part.startsWith('.')) || inApps(joinFolder(parent, name)))
    return 'reserved'
  return null
}

/**
 * Hidden entries (the service's `.disc`, what macOS leaves) and, at the card's root, the apps' folder are not the
 * owner's files to browse.
 */
export function visibleEntries(entries: readonly FolderEntry[], parent = ''): FolderEntry[] {
  return entries.filter(
    (entry) => !entry.name.startsWith('.') && !(entry.folder && inApps(joinFolder(parent, entry.name))),
  )
}

/** Stock's listing sorted as a file manager does: folders first, then by name in the locale's order. */
export function sortEntries(entries: readonly FolderEntry[], locale: string): FolderEntry[] {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' })
  return [...entries].sort((a, b) => Number(b.folder) - Number(a.folder) || collator.compare(a.name, b.name))
}

export interface FolderStats {
  /** Library tracks in the folder and below it. */
  tracks: number
  /** Measured bytes of their distinct files (a CUE image once). */
  bytes: number
  /** Distinct files, and how many are measured. */
  files: number
  measured: number
  /** The one album all those tracks belong to, if they share one. */
  album: string | null
}

/** What the library knows about the music in a folder and below it. */
export function folderStats(
  tracks: readonly LibraryTrack[],
  files: Readonly<Record<string, FileFacts>>,
  folder: string,
): FolderStats {
  const prefix = cardFolder(folder)
  const inside = tracks.filter((track) => track.path?.startsWith(prefix))
  const paths = [...new Set(inside.flatMap((track) => (track.path ? [track.path] : [])))]
  const measured = paths.flatMap((path) => (files[path] ? [files[path]] : []))
  const albums = new Set(inside.map((track) => track.album))
  const [only] = albums
  return {
    tracks: inside.length,
    bytes: measured.reduce((sum, file) => sum + file.bytes, 0),
    files: paths.length,
    measured: measured.length,
    album: albums.size === 1 && only ? only : null,
  }
}

/** What is known about the music right in a folder (owner, 2026-10-22: a line under the folder's path). */
export interface FolderFacts {
  /** Library tracks whose file is in the folder itself (not below it). */
  tracks: number
  /** Their one album, when they share one; otherwise null and `albums` lists them. */
  album: { title: string; artist: string | null } | null
  /** The albums of those tracks, the fullest first; an artist where the album's tracks share one. */
  albums: { title: string; artist: string | null; tracks: number }[]
  /** The track artists, the fullest first. */
  artists: { name: string; tracks: number }[]
  /** The year of the tags, where one file's is known. */
  year: number | null
  /** The audio files' extensions, in upper case, as they come. */
  formats: string[]
  /** The folder's cover file (cover, folder or front first, else any image), by name. */
  cover: string | null
  /** Audio files with a same-stem .lrc beside them, of all audio files listed. */
  lyrics: { have: number; of: number }
  /** Tracks stock lists under its names for missing tags. */
  unknownTags: number
}

const stem = (name: string) => name.replace(/\.[^.]*$/, '').toLowerCase()
const COVER_STEMS = new Set(['cover', 'folder', 'front'])

export function folderFacts(input: {
  tracks: readonly LibraryTrack[]
  entries: readonly FolderEntry[]
  folder: string
  years: Readonly<Record<string, number>>
}): FolderFacts {
  const prefix = cardFolder(input.folder)
  const inside = input.tracks.filter(
    (track) => track.path?.startsWith(prefix) && !track.path.slice(prefix.length).includes('/'),
  )
  const albums = new Map<string, { title: string; artist: string | null; tracks: number }>()
  const artists = new Map<string, { name: string; tracks: number }>()
  for (const track of inside) {
    if (track.album) {
      const credits = new Set(inside.filter((other) => other.album === track.album).map((other) => other.artist))
      const album = albums.get(track.album) ?? {
        title: track.album,
        artist: credits.size === 1 ? [...credits][0] || null : null,
        tracks: 0,
      }
      album.tracks++
      albums.set(track.album, album)
    }
    if (track.artist) {
      const artist = artists.get(track.artist) ?? { name: track.artist, tracks: 0 }
      artist.tracks++
      artists.set(track.artist, artist)
    }
  }
  const fullest = <T extends { tracks: number }>(rows: T[], name: (row: T) => string) =>
    rows.sort((a, b) => b.tracks - a.tracks || name(a).localeCompare(name(b)))
  const files = input.entries.filter((entry) => !entry.folder)
  const audio = files.filter((entry) => {
    const kind = entry.kind ?? null
    return kind ? kind === 'audio' : !entry.image && !entry.playlist && !/\.(lrc|cue)$/i.test(entry.name)
  })
  const lyrics = new Set(files.filter((entry) => /\.lrc$/i.test(entry.name)).map((entry) => stem(entry.name)))
  const images = files.filter((entry) => entry.image)
  const cover = images.find((entry) => COVER_STEMS.has(stem(entry.name))) ?? images[0] ?? null
  const years = inside.flatMap((track) => {
    const year = track.path ? input.years[track.path] : undefined
    return year ? [year] : []
  })
  return {
    tracks: inside.length,
    album: albums.size === 1 ? ([...albums.values()].map(({ title, artist }) => ({ title, artist }))[0] ?? null) : null,
    albums: fullest([...albums.values()], (row) => row.title),
    artists: fullest([...artists.values()], (row) => row.name),
    year: years.length ? Math.min(...years) : null,
    formats: [...new Set(audio.map((entry) => entry.name.replace(/^.*\./, '').toUpperCase()))].sort(),
    cover: cover?.name ?? null,
    lyrics: { have: audio.filter((entry) => lyrics.has(stem(entry.name))).length, of: audio.length },
    unknownTags: inside.filter(
      (track) => stockUnknown(track.artist) || stockUnknown(track.album) || stockUnknown(track.genre),
    ).length,
  }
}
