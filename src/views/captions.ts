/** Card captions and routes shared by views (reference cardCaption). */
import type { CardLine } from '../components/collection/cardLine'
import { albumScope, type Album } from '../domain/album'
import { creditArtists, creditLabel, credits } from '../domain/artist'
import { factParts, type ArtistType, type FactsSource } from '../domain/artistFacts'
import type { Playlist } from '../domain/playlist'
import { locale, t, type MessageKey } from '../i18n'

/** An album link; the artist scope separates releases that share a title. */
export const albumRoute = (title: string, artist: string | null = null) =>
  artist ? { name: 'album', params: { name: title, artist } } : { name: 'album', params: { name: title } }
export const artistRoute = (name: string) => ({ name: 'artist', params: { name } })
export const playlistRoute = (id: number) => ({ name: 'playlist', params: { id } })

/** Row links: a track's artist page, and its album scoped by that artist. */
export const trackArtistRoute = (track: { artist: string | null }) => (track.artist ? artistRoute(track.artist) : null)
export const trackAlbumRoute = (track: { album: string | null; artist: string | null }) =>
  track.album ? albumRoute(track.album, track.artist || null) : null

/** A genre page's album link: genre-scoped only when the album also holds other genres. */
export function genreAlbumRoute(album: Album, genre: string, mixed: boolean) {
  return mixed ? { name: 'album', params: { name: album.title }, query: { genre } } : albumCardRoute(album)
}
export const genreRoute = (name: string) => ({ name: 'genre', params: { name } })

/** The artist every credit of an album names (its lead, when others only join on some tracks). */
export function leadArtist(album: Album): string | null {
  const [first] = album.artists
  if (!first) return null
  return creditArtists(first).find((name) => album.artists.every((credit) => credits(credit, name))) ?? null
}

export function albumLines(album: Album): CardLine[] {
  const lines: CardLine[] = []
  const [only] = album.artists
  const lead = leadArtist(album)
  // A joint album names the pair ("A & B") and opens their page.
  if (album.artists.length === 1 && only && creditArtists(only).length > 1)
    lines.push({ text: creditLabel(only), to: artistRoute(only) })
  else if (lead) lines.push({ text: lead, to: artistRoute(lead) })
  else if (album.artists.length > 1) lines.push({ text: t('various_artists') })
  // No track count: the album page numbers its tracks (owner, 2026-09-29).
  return lines
}

/** A card link for a title group: scoped when one artist owns it, or by the given artist. */
export const albumCardRoute = (album: Album, artist: string | null = null) =>
  albumRoute(album.title, artist ?? albumScope(album))

/** A card on an artist page names nobody for the artist's own albums (the page already does). */
export function artistAlbumLines(album: Album, artist: string): CardLine[] {
  return album.trackArtists.includes(artist) ? [] : albumLines(album)
}

/** The year as a line of its own, under the credit. */
export function withYear(lines: CardLine[], year: number | null): CardLine[] {
  return year ? [...lines, { text: String(year) }] : lines
}

export function playlistLines(playlist: Playlist): CardLine[] {
  return [{ text: t('track_count', { count: playlist.trackCount }) }]
}

export function countLine(searching: boolean, count: number): string {
  return `${t(searching ? 'found' : 'in_this_section')}: ${count}`
}

const ARTIST_TYPE_NAMES: Record<ArtistType, MessageKey> = {
  Person: 'artist_type_person',
  Group: 'artist_type_group',
  Orchestra: 'artist_type_orchestra',
  Choir: 'artist_type_choir',
  Character: 'artist_type_character',
  Other: 'artist_type_other',
}
/** An artist's MusicBrainz facts as one line ("Group · United Kingdom · 2001–"), with MusicBrainz's note when asked. */
export const artistFactsLine = (facts: FactsSource, note = true): string =>
  factParts(note ? facts : { ...facts, disambiguation: null }, locale.value, (type) => t(ARTIST_TYPE_NAMES[type])).join(
    ' · ',
  )
