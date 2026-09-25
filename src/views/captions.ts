/** Card captions shared by views (reference cardCaption). */
import type { Album } from '../domain/album'
import type { Playlist } from '../domain/playlist'
import { t } from '../i18n'

export function albumLines(album: Album): string[] {
  const artist = album.artists.length > 1 ? t('various_artists') : (album.artists[0] ?? '')
  const lines = [artist, t('track_count', { count: album.trackCount })].filter(Boolean)
  return lines.length ? lines : [t('album_on_disc')]
}

export function playlistLines(playlist: Playlist): string[] {
  return [t('track_count', { count: playlist.trackCount })]
}

export function countLine(searching: boolean, count: number): string {
  return `${t(searching ? 'found' : 'in_this_section')}: ${count}`
}
