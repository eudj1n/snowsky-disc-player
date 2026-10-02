/**
 * The library's state (owner, 2026-10-02: the Card section's State tab): what
 * the collection lacks, counted from what the page already knows (the
 * library, the MusicBrainz identities and the images kept on the player, the
 * covers read in the background) and one walk of the card (its .lrc and image
 * files, the years of the tags). Pure: the view passes the facts in.
 */
import { stockUnknown, type Album } from './album'
import { folderCoverName } from './covers'
import { sidecarPath } from './lyrics'
import type { LibraryTrack } from './track'

const CARD = '/tmp/sdcard/'

export interface LibraryFacts {
  tracks: readonly LibraryTrack[]
  albums: readonly Album[]
  /** The artists the Artists page shows by default: those with records of their own. */
  artists: readonly { name: string }[]
  identifiedArtist: (name: string) => boolean
  identifiedAlbum: (album: Album) => boolean
  /** Whether an album's cover was found, is known missing, or was not read yet. */
  coverState: (album: Album) => 'found' | 'missing' | 'unknown'
  photo: (name: string) => boolean
  background: (name: string) => boolean
  /** The card's walk: its .lrc and image files by card path; null before it. */
  walk: { lyrics: readonly string[]; images: readonly string[] } | null
  /** Track path → the year of its tags, as the walk read them. */
  years: Readonly<Record<string, number>>
}

export interface LibraryState {
  artists: { total: number; identified: number; photo: number; background: number }
  albums: {
    total: number
    identified: number
    /** Where the covers are: inside the files, a folder file, none, or not read yet. */
    covers: { embedded: number; folder: number; none: number; unknown: number }
    /** Albums none of whose files names a year; null before the walk. */
    noYear: number | null
  }
  lyrics: {
    /** Distinct audio files. */
    tracks: number
    /** Files with a same-stem .lrc beside them; null before the walk. */
    sidecar: number | null
  }
  tags: { unknownArtist: number; unknownAlbum: number; unknownGenre: number }
}

const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/'))
const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)

/** The album's cover by where it lies: a cover file in one of its folders, else the files' own when one was found. */
export function coverPlaceOf(
  album: Album,
  tracks: readonly LibraryTrack[],
  imagesByFolder: ReadonlyMap<string, readonly string[]> | null,
  state: 'found' | 'missing' | 'unknown',
): 'embedded' | 'folder' | 'none' | 'unknown' {
  if (imagesByFolder) {
    const folders = new Set(
      tracks.flatMap((track) => (track.album === album.title && track.path ? [folderOf(track.path)] : [])),
    )
    for (const folder of folders) if (folderCoverName(imagesByFolder.get(folder) ?? [])) return 'folder'
  }
  if (state === 'found') return 'embedded'
  return state === 'missing' ? 'none' : 'unknown'
}

export function libraryState(facts: LibraryFacts): LibraryState {
  const { tracks, albums, artists } = facts
  const imagesByFolder = facts.walk ? new Map<string, string[]>() : null
  if (imagesByFolder && facts.walk)
    for (const path of facts.walk.images) {
      const folder = folderOf(path)
      imagesByFolder.set(folder, [...(imagesByFolder.get(folder) ?? []), nameOf(path)])
    }
  const covers = { embedded: 0, folder: 0, none: 0, unknown: 0 }
  for (const album of albums) covers[coverPlaceOf(album, tracks, imagesByFolder, facts.coverState(album))]++
  const files = [...new Set(tracks.flatMap((track) => (track.path ? [track.path] : [])))]
  const sidecars = facts.walk ? new Set(facts.walk.lyrics) : null
  const sidecar = sidecars
    ? files.filter((path) => {
        const lrc = sidecarPath(path)
        return lrc !== null && sidecars.has(CARD + lrc)
      }).length
    : null
  const noYear = facts.walk
    ? albums.filter(
        (album) => !tracks.some((track) => track.album === album.title && track.path && facts.years[track.path]),
      ).length
    : null
  return {
    artists: {
      total: artists.length,
      identified: artists.filter((artist) => facts.identifiedArtist(artist.name)).length,
      photo: artists.filter((artist) => facts.photo(artist.name)).length,
      background: artists.filter((artist) => facts.background(artist.name)).length,
    },
    albums: {
      total: albums.length,
      identified: albums.filter((album) => facts.identifiedAlbum(album)).length,
      covers,
      noYear,
    },
    lyrics: { tracks: files.length, sidecar },
    tags: {
      unknownArtist: tracks.filter((track) => stockUnknown(track.artist)).length,
      unknownAlbum: tracks.filter((track) => stockUnknown(track.album)).length,
      unknownGenre: tracks.filter((track) => stockUnknown(track.genre)).length,
    },
  }
}
