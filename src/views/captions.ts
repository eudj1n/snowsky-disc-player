/** Card captions and routes shared by views (reference cardCaption). */
import type { CardLine } from '../components/collection/CoverCard.vue'
import type { Album } from '../domain/album'
import type { Playlist } from '../domain/playlist'
import { t } from '../i18n'

export const albumRoute = (title: string) => ({ name: 'album', params: { name: title } })
export const artistRoute = (name: string) => ({ name: 'artist', params: { name } })
export const playlistRoute = (id: number) => ({ name: 'playlist', params: { id } })

export function albumLines(album: Album): CardLine[] {
  const lines: CardLine[] = []
  const [only] = album.artists
  if (album.artists.length > 1) lines.push({ text: t('various_artists') })
  else if (only) lines.push({ text: only, to: artistRoute(only) })
  lines.push({ text: t('track_count', { count: album.trackCount }) })
  return lines
}

export function playlistLines(playlist: Playlist): CardLine[] {
  return [{ text: t('track_count', { count: playlist.trackCount }) }]
}

export function countLine(searching: boolean, count: number): string {
  return `${t(searching ? 'found' : 'in_this_section')}: ${count}`
}
