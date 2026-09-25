/** Card captions and routes shared by views (reference cardCaption). */
import type { CardLine } from '../components/collection/CoverCard.vue'
import { albumScope, type Album } from '../domain/album'
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

export function albumLines(album: Album): CardLine[] {
  const lines: CardLine[] = []
  const [only] = album.artists
  if (album.artists.length > 1) lines.push({ text: t('various_artists') })
  else if (only) lines.push({ text: only, to: artistRoute(only) })
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

export function playlistLines(playlist: Playlist): CardLine[] {
  return [{ text: t('track_count', { count: playlist.trackCount }) }]
}

export function countLine(searching: boolean, count: number): string {
  return `${t(searching ? 'found' : 'in_this_section')}: ${count}`
}
