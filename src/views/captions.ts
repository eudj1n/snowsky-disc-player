/** Card captions and routes shared by views (reference cardCaption). */
import type { CardLine } from '../components/collection/cardLine'
import { albumScope, type Album } from '../domain/album'
import { creditArtists, credits } from '../domain/artist'
import type { Playlist } from '../domain/playlist'
import { t } from '../i18n'

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
  const lead = leadArtist(album)
  if (lead) lines.push({ text: lead, to: artistRoute(lead) })
  else if (album.artists.length > 1) lines.push({ text: t('various_artists') })
  lines.push({ text: t('track_count', { count: album.trackCount }) })
  return lines
}

/** A card link for a title group: scoped when one artist owns it, or by the given artist. */
export const albumCardRoute = (album: Album, artist: string | null = null) =>
  albumRoute(album.title, artist ?? albumScope(album))

/** A card on an artist page counts this artist's tracks (the page already names them). */
export function artistAlbumLines(album: Album, artist: string, scopedCount: number): CardLine[] {
  if (album.trackArtists.includes(artist)) return [{ text: t('track_count', { count: scopedCount }) }]
  return albumLines(album)
}

/** Puts a year before the last line (the track count): "2004 · 3 tracks". */
export function withYear(lines: CardLine[], year: number | null): CardLine[] {
  if (!year) return lines
  return lines.map((line, index) => (index === lines.length - 1 ? { ...line, text: `${year} · ${line.text}` } : line))
}

export function playlistLines(playlist: Playlist): CardLine[] {
  return [{ text: t('track_count', { count: playlist.trackCount }) }]
}

export function countLine(searching: boolean, count: number): string {
  return `${t(searching ? 'found' : 'in_this_section')}: ${count}`
}
