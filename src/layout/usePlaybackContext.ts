/**
 * "Playing from": the stock reports only the kind of source (a202
 * playerflag). The name comes from what the page knows: the track's album and
 * artist, its genre tag in the library, its folder, or the one playlist that
 * holds it. Unknown stays unnamed; nothing is guessed across candidates.
 */
import { creditLabel } from '../domain/artist'
import { findGenre } from '../domain/genre'
import { computed, ref, watch, type ComputedRef } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { t } from '../i18n'
import { genres, library, loadPlaylistTracks, trackByPath } from '../stores/library'
import { autoPlaylists } from '../stores/autoPlaylists'
import { browserPlayback } from '../stores/browser'
import { inBrowser, nowPlaying } from '../stores/output'
import { playback } from '../stores/playback'
import type { Playback } from '../domain/playback'
import { albumRoute, artistRoute, genreRoute, playlistRoute } from '../views/captions'

export interface PlaybackContext {
  text: string
  to: RouteLocationRaw | null
}

/** Playlists are checked only while there are few of them (data-level reads). */
const MAX_PLAYLISTS = 30
const members = new Map<number, Set<string>>()

function createContext() {
  const playlist = ref<{ id: number; name: string } | null>(null)

  watch(
    () => [playback.current.source, playback.current.track?.path, library.playlists] as const,
    async ([source, path, lists]) => {
      playlist.value = null
      if (source !== 'playlist' || !path || lists.length > MAX_PLAYLISTS) return
      const found: { id: number; name: string }[] = []
      for (const list of lists) {
        let paths = members.get(list.id)
        if (!paths) {
          try {
            paths = new Set(
              (await loadPlaylistTracks(list.listId)).flatMap((track) => (track.path ? [track.path] : [])),
            )
          } catch {
            return
          }
          members.set(list.id, paths)
        }
        if (paths.has(path)) found.push({ id: list.id, name: list.name })
      }
      if (found.length === 1 && playback.current.track?.path === path) playlist.value = found[0] ?? null
    },
    { immediate: true },
  )
  // A new collection snapshot may have changed playlist members.
  watch(
    () => library.playlists,
    () => members.clear(),
  )

  /** A page source played in this browser, named as the page names it. */
  function browserContext(): PlaybackContext | null {
    const origin = browserPlayback.origin
    const track = nowPlaying.value.track
    if (!origin || !track) return null
    if (origin.kind === 'queue') return describe({ ...nowPlaying.value, source: origin.source, list: origin.list })
    const target = origin.target
    switch (target.kind) {
      case 'album':
        return { text: t('from_album', { name: target.album }), to: albumRoute(target.album) }
      case 'artistAlbum':
        return { text: t('from_album', { name: target.album }), to: albumRoute(target.album, target.artist) }
      case 'artist':
        return { text: t('from_artist', { name: creditLabel(target.artist) }), to: artistRoute(target.artist) }
      case 'genre':
      case 'genreAlbum':
        return { text: t('from_genre', { name: target.genre }), to: genreRoute(target.genre) }
      case 'library':
        return { text: t('from_library'), to: '/tracks' }
      case 'favorites':
        return { text: t('from_favorites'), to: '/favorites' }
      case 'playlist': {
        const list = library.playlists.find((item) => item.name === target.name)
        return { text: t('from_playlist', { name: target.name }), to: list ? playlistRoute(list.id) : '/playlists' }
      }
      case 'folder':
        return {
          text: t('from_folder', { name: target.folder.split('/').at(-1) || '/' }),
          to: { name: 'cardFiles', query: target.folder ? { folder: target.folder } : {} },
        }
      case 'list': {
        const own = autoPlaylists.lists.some((list) => list.name === target.name)
        return {
          text: t('from_playlist', { name: target.name }),
          to: own ? { name: 'list', params: { name: target.name } } : null,
        }
      }
    }
  }

  return computed<PlaybackContext | null>(() => (inBrowser.value ? browserContext() : describe(playback.current)))

  function describe(current: Playback): PlaybackContext | null {
    const track = current.track
    if (!track || !current.source) return null
    switch (current.source) {
      case 'queue':
        return { text: t('from_queue'), to: null }
      case 'library':
        return { text: t('from_library'), to: '/tracks' }
      case 'favorites':
        return { text: t('from_favorites'), to: '/favorites' }
      case 'artist':
        return track.artist
          ? { text: t('from_artist', { name: creditLabel(track.artist) }), to: artistRoute(track.artist) }
          : null
      case 'album':
        return track.album ? { text: t('from_album', { name: track.album }), to: albumRoute(track.album) } : null
      case 'artistAlbum':
        return track.album
          ? { text: t('from_album', { name: track.album }), to: albumRoute(track.album, track.artist) }
          : track.artist
            ? { text: t('from_artist', { name: creditLabel(track.artist) }), to: artistRoute(track.artist) }
            : null
      case 'genre':
      case 'genreTrack': {
        const literal = track.path ? trackByPath.value.get(track.path)?.genre : null
        const genre = literal ? (findGenre(genres.value, literal)?.name ?? literal.trim()) : null
        return genre
          ? { text: t('from_genre', { name: genre }), to: genreRoute(genre) }
          : { text: t('from_genre_unknown'), to: null }
      }
      case 'folder': {
        // Stock reports an M3U list as a folder play: the list names it, and an automatic one opens its page.
        if (current.list) {
          const name =
            current.list
              .split('/')
              .at(-1)
              ?.replace(/\.m3u8?$/i, '') ?? current.list
          const own = autoPlaylists.lists.some((list) => list.name === name)
          return { text: t('from_playlist', { name }), to: own ? { name: 'list', params: { name } } : null }
        }
        const folder = track.path?.split('/').slice(-2, -1)[0]
        return folder ? { text: t('from_folder', { name: folder }), to: null } : null
      }
      case 'playlist':
        return playlist.value
          ? { text: t('from_playlist', { name: playlist.value.name }), to: playlistRoute(playlist.value.id) }
          : { text: t('from_playlist_unknown'), to: '/playlists' }
    }
  }
}

let shared: ComputedRef<PlaybackContext | null> | null = null

/** One context for the whole page (the bar and the panel share it and its reads). */
export function usePlaybackContext(): ComputedRef<PlaybackContext | null> {
  shared ??= createContext()
  return shared
}
