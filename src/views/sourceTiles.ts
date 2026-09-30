/**
 * The home shelf's tiles for the sources the listener started (service play
 * history, next image) and the source notes of the track history: one shape
 * for albums, artists, genres, playlists and the favorites.
 */
import type { RouteLocationRaw } from 'vue-router'
import { albumScope } from '../domain/album'
import { creditLabel } from '../domain/artist'
import { findGenre } from '../domain/genre'
import type { PlaySource } from '../domain/history'
import type { SelectionTarget } from '../gateway/selection'
import { t } from '../i18n'
import { albumCover, coverFor } from '../stores/enrichment'
import { favorites, genres, trackByPath } from '../stores/library'

/** A played genre (one stock spelling) under the name the page shows for it. */
const genreName = (literal: string) => findGenre(genres.value, literal)?.name ?? literal.trim()
import { albumCardRoute, artistRoute, genreRoute, leadArtist, playlistRoute } from './captions'

export interface SourceTileModel {
  key: string
  title: string
  caption: string
  to: RouteLocationRaw
  cover: Blob | null
  play: SelectionTarget | null
}

/** The cover of the track that played, standing for a source without one of its own. */
function playedCover(path: string): Blob | null {
  const track = trackByPath.value.get(path)
  return track ? coverFor(track) : null
}

export function sourceTile(source: PlaySource, path: string): SourceTileModel | null {
  switch (source.kind) {
    case 'album': {
      const { album, scope } = source
      const lead = scope ?? leadArtist(album)
      return {
        key: `album:${album.key}:${scope ?? ''}`,
        title: album.title,
        caption: lead ? `${t('kind_album')} · ${creditLabel(lead)}` : t('kind_album'),
        to: albumCardRoute(album, scope),
        cover: albumCover(album, scope ?? albumScope(album)),
        play: scope
          ? { kind: 'artistAlbum', artist: scope, album: album.title }
          : { kind: 'album', album: album.title },
      }
    }
    case 'artist':
      return {
        key: `artist:${source.artist}`,
        title: creditLabel(source.artist),
        caption: t('kind_artist'),
        to: artistRoute(source.artist),
        cover: playedCover(path),
        play: { kind: 'artist', artist: source.artist },
      }
    case 'genre':
      return {
        key: `genre:${source.genre}`,
        title: genreName(source.genre),
        caption: t('kind_genre'),
        to: genreRoute(genreName(source.genre)),
        cover: playedCover(path),
        play: { kind: 'genre', genre: source.genre },
      }
    case 'list':
      return {
        key: `list:${source.name}`,
        title: source.name,
        caption: `${t('kind_auto_playlist')} · ${t('track_count', { count: source.count })}`,
        to: '/playlists',
        cover: playedCover(path),
        play: { kind: 'list', scope: 'external', name: source.name },
      }
    case 'playlist':
      return {
        key: `playlist:${String(source.playlist.id)}`,
        title: source.playlist.name,
        caption: `${t('kind_playlist')} · ${t('track_count', { count: source.playlist.trackCount })}`,
        to: playlistRoute(source.playlist.id),
        cover: playedCover(path),
        play: { kind: 'playlist', name: source.playlist.name },
      }
    case 'favorites': {
      const first = favorites.value[0]
      return {
        key: 'favorites',
        title: t('favorites'),
        caption: `${t('kind_playlist')} · ${t('track_count', { count: favorites.value.length })}`,
        to: '/favorites',
        cover: playedCover(path),
        play: first ? { kind: 'favorites', track: { title: first.title, artist: first.artist } } : null,
      }
    }
    default:
      return null
  }
}

/** Where a track in the history played from, for its row: the source's kind and name. */
export function sourceNote(source: PlaySource | null): { text: string; to: RouteLocationRaw | null } | null {
  if (!source) return null
  switch (source.kind) {
    case 'album':
      return { text: source.album.title, to: albumCardRoute(source.album, source.scope) }
    case 'artist':
      return { text: `${t('kind_artist')} · ${creditLabel(source.artist)}`, to: artistRoute(source.artist) }
    case 'genre':
      return { text: `${t('kind_genre')} · ${genreName(source.genre)}`, to: genreRoute(genreName(source.genre)) }
    case 'playlist':
      return { text: `${t('kind_playlist')} · ${source.playlist.name}`, to: playlistRoute(source.playlist.id) }
    case 'list':
      return { text: `${t('kind_auto_playlist')} · ${source.name}`, to: '/playlists' }
    case 'favorites':
      return { text: t('favorites'), to: '/favorites' }
    default:
      return { text: t('tracks'), to: '/tracks' }
  }
}
