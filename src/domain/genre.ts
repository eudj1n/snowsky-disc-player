import type { Album } from './album'
import { creditArtists } from './artist'
import type { LibraryTrack } from './track'

/**
 * A genre as the library tags it. Spellings that differ only in case and
 * spacing ("alternative", "Alternative", "Alternative ") are one genre on the
 * page (owner, 2026-09-27), shown under its most used spelling. Stock keeps
 * each spelling as a genre (`style`) of its own and plays one at a time, so
 * the literal spellings stay listed for playback. Untagged tracks and the
 * reserved `unknown_style` token form no genre (reference: unresolved genre
 * groups stay disabled).
 */
export interface Genre {
  /** The spelling shown: the one most tracks carry, trimmed. */
  name: string
  /** The literal stock genres grouped here, the one with the most tracks first. */
  variants: string[]
  trackCount: number
  /** Album titles with at least one track in this genre, first-seen order. */
  albums: string[]
  /** Latest ADD_TIME among its tracks (seconds). */
  addedAt: number | null
}

const usable = (genre: string | null): genre is string =>
  genre !== null && genre.trim() !== '' && genre !== 'unknown_style'

/** What makes two spellings one genre: Unicode form, case and spacing aside. */
export function genreKey(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** The track carries this genre in one of its spellings. */
export const sameGenre = (literal: string | null, name: string): boolean =>
  literal !== null && genreKey(literal) === genreKey(name)

export function groupGenres(tracks: readonly LibraryTrack[]): Genre[] {
  const genres = new Map<string, Genre & { counts: Map<string, number> }>()
  for (const track of tracks) {
    if (!usable(track.genre)) continue
    const key = genreKey(track.genre)
    let genre = genres.get(key)
    if (!genre) {
      genre = { name: track.genre, variants: [], trackCount: 0, albums: [], addedAt: null, counts: new Map() }
      genres.set(key, genre)
    }
    genre.trackCount++
    genre.counts.set(track.genre, (genre.counts.get(track.genre) ?? 0) + 1)
    if (track.album && !genre.albums.includes(track.album)) genre.albums.push(track.album)
    if (track.addedAt !== null && (genre.addedAt === null || track.addedAt > genre.addedAt))
      genre.addedAt = track.addedAt
  }
  return [...genres.values()].map(({ counts, ...genre }) => {
    // Most tracks first; a tie prefers a capitalised spelling, then the first seen.
    const capital = (name: string) => (/^\p{Lu}/u.test(name.trim()) ? 1 : 0)
    const variants = [...counts.keys()].sort(
      (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || capital(b) - capital(a),
    )
    return { ...genre, variants, name: (variants[0] ?? genre.name).trim().replace(/\s+/g, ' ') }
  })
}

/** The genre a name or any of its spellings (an older link, a play context) stands for. */
export function findGenre(genres: readonly Genre[], name: string): Genre | null {
  const key = genreKey(name)
  return genres.find((genre) => genreKey(genre.name) === key) ?? null
}

/** Genres by name in the locale's collation. */
export function sortGenres(genres: readonly Genre[], locale: string): Genre[] {
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true })
  return [...genres].sort((a, b) => collator.compare(a.name, b.name))
}

/** Tracks tagged with this genre in any spelling, in library order. */
export function genreTracks<T extends LibraryTrack>(tracks: readonly T[], genre: string): T[] {
  return tracks.filter((track) => sameGenre(track.genre, genre))
}

/** Title groups with tracks in this genre, most recently added first. */
export function genreAlbums(albums: readonly Album[], genre: Genre): Album[] {
  return albums
    .filter((album) => album.genres.some((literal) => sameGenre(literal, genre.name)))
    .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
}

/**
 * The stock genre to play for these tracks: the spelling most of them carry
 * (stock plays one spelling at a time).
 */
export function playableGenre(tracks: readonly Pick<LibraryTrack, 'genre'>[], genre: Genre): string {
  const counts = new Map<string, number>()
  for (const track of tracks)
    if (track.genre && sameGenre(track.genre, genre.name)) counts.set(track.genre, (counts.get(track.genre) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? genre.variants[0] ?? genre.name
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
    if (!sameGenre(track.genre, genre) || !track.artist) continue
    literal.add(track.artist)
    for (const name of creditArtists(track.artist)) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts]
    .map(([name, trackCount]) => ({ name, trackCount, literal: literal.has(name) }))
    .sort((a, b) => b.trackCount - a.trackCount)
}
