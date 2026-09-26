import type { Album } from './album'
import { creditArtists } from './artist'
import type { LibraryTrack } from './track'

/**
 * A stock genre (`style`) as the library tags it. Literal names only: no
 * alias merging, and untagged tracks or the reserved `unknown_style` token
 * form no genre (reference: unresolved genre groups stay disabled).
 */
export interface Genre {
  name: string
  trackCount: number
  /** Album titles with at least one track in this genre, first-seen order. */
  albums: string[]
  /** Latest ADD_TIME among its tracks (seconds). */
  addedAt: number | null
}

const usable = (genre: string | null): genre is string =>
  genre !== null && genre.trim() !== '' && genre !== 'unknown_style'

export function groupGenres(tracks: readonly LibraryTrack[]): Genre[] {
  const genres = new Map<string, Genre>()
  for (const track of tracks) {
    if (!usable(track.genre)) continue
    let genre = genres.get(track.genre)
    if (!genre) {
      genre = { name: track.genre, trackCount: 0, albums: [], addedAt: null }
      genres.set(track.genre, genre)
    }
    genre.trackCount++
    if (track.album && !genre.albums.includes(track.album)) genre.albums.push(track.album)
    if (track.addedAt !== null && (genre.addedAt === null || track.addedAt > genre.addedAt))
      genre.addedAt = track.addedAt
  }
  return [...genres.values()]
}

/** Genres by name in the locale's collation. */
export function sortGenres(genres: readonly Genre[], locale: string): Genre[] {
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true })
  return [...genres].sort((a, b) => collator.compare(a.name, b.name))
}

/** Tracks tagged with this genre, in library order. */
export function genreTracks<T extends LibraryTrack>(tracks: readonly T[], genre: string): T[] {
  return tracks.filter((track) => track.genre === genre)
}

/** Title groups with tracks in this genre, most recently added first. */
export function genreAlbums(albums: readonly Album[], genre: Genre): Album[] {
  return albums.filter((album) => album.genres.includes(genre.name)).sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
}

export interface GenreArtist {
  name: string
  /** Tracks of this artist in the genre, joint credits included. */
  trackCount: number
  /** Stock knows this name as an artist of its own (not only inside a joint credit), so it can play it. */
  literal: boolean
}

/** Literal track artists of a genre, the most represented first, ties by first appearance. */
export function genreArtists(tracks: readonly LibraryTrack[], genre: string): GenreArtist[] {
  const counts = new Map<string, number>()
  const literal = new Set<string>()
  for (const track of tracks) {
    if (track.genre !== genre || !track.artist) continue
    literal.add(track.artist)
    for (const name of creditArtists(track.artist)) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts]
    .map(([name, trackCount]) => ({ name, trackCount, literal: literal.has(name) }))
    .sort((a, b) => b.trackCount - a.trackCount)
}
