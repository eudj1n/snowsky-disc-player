/**
 * The global search's results (owner, 2026-09-30): the whole collection, by
 * kind, the section the search started from first. The palette shows a few
 * of each; the search page shows them all.
 */
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { albumScope, type Album } from '../domain/album'
import type { Artist } from '../domain/artist'
import type { Genre } from '../domain/genre'
import { creditLabel } from '../domain/artist'
import { indexOf, rank } from '../domain/globalSearch'
import type { LibraryTrack } from '../domain/track'
import type { SelectionTarget } from '../gateway/selection'
import { t } from '../i18n'
import type { SectionName } from '../router'
import { artistImage } from '../stores/artistPictures'
import { autoPlaylists } from '../stores/autoPlaylists'
import { albumCover, coverFor } from '../stores/enrichment'
import { albums, artists, genres, library, tracks } from '../stores/library'
import type { IconName } from '../ui/icons'
import { albumCardRoute, artistRoute, genreRoute, leadArtist, playlistRoute } from './captions'

export type GroupKind = 'tracks' | 'albums' | 'artists' | 'playlists' | 'genres'

/** A playlist of the stock database or an automatic list of the page's. */
export interface FoundList {
  name: string
  to: RouteLocationRaw
  count: number | null
  /** What Play selects. */
  play: { kind: 'playlist'; name: string } | { kind: 'list'; scope: 'external'; name: string }
  auto: boolean
}

export type Hit =
  | { kind: 'tracks'; key: string; score: number; track: LibraryTrack }
  | { kind: 'albums'; key: string; score: number; album: Album }
  | { kind: 'artists'; key: string; score: number; artist: Artist }
  | { kind: 'playlists'; key: string; score: number; list: FoundList }
  | { kind: 'genres'; key: string; score: number; genre: Genre }

export interface SearchGroup {
  kind: GroupKind
  hits: Hit[]
}

export interface SearchResults {
  top: Hit | null
  groups: SearchGroup[]
}

const ORDER: readonly GroupKind[] = ['tracks', 'albums', 'artists', 'playlists', 'genres']

/** The kind a section lists: its results come first. */
export function groupOf(section: SectionName | null): GroupKind | null {
  if (section === 'albums' || section === 'new' || section === 'home') return 'albums'
  if (section === 'artists' || section === 'genres' || section === 'playlists' || section === 'tracks') return section
  if (section === 'favorites') return 'tracks'
  return null
}

const foundLists = computed<FoundList[]>(() => [
  ...library.playlists.map<FoundList>((playlist) => ({
    name: playlist.name,
    to: playlistRoute(playlist.id),
    count: playlist.trackCount,
    play: { kind: 'playlist', name: playlist.name },
    auto: false,
  })),
  ...autoPlaylists.lists.map<FoundList>((list) => ({
    name: list.name,
    to: { name: 'list', params: { name: list.name } },
    count: autoPlaylists.entries[list.name]?.length ?? null,
    play: { kind: 'list', scope: 'external', name: list.name },
    auto: true,
  })),
])

// Prepared once per collection, not on each keystroke.
const trackIndex = computed(() =>
  indexOf(tracks.value, (track) => [track.title, track.artist, track.album, track.albumArtist]),
)
const albumIndex = computed(() => indexOf(albums.value, (album) => [album.title, ...album.artists]))
const artistIndex = computed(() => indexOf(artists.value, (artist) => [artist.name]))
const listIndex = computed(() => indexOf(foundLists.value, (list) => [list.name]))
const genreIndex = computed(() => indexOf(genres.value, (genre) => [genre.name, ...genre.variants]))

/** Every kind's matches, best first; the top result leaves its group. */
export function searchCollection(query: string, from: GroupKind | null): SearchResults {
  const all: Record<GroupKind, Hit[]> = {
    tracks: rank(trackIndex.value, query).map(({ item, score }) => ({
      kind: 'tracks',
      key: `t${String(item.id)}`,
      score,
      track: item,
    })),
    albums: rank(albumIndex.value, query).map(({ item, score }) => ({
      kind: 'albums',
      key: `a${item.key}`,
      score,
      album: item,
    })),
    artists: rank(artistIndex.value, query).map(({ item, score }) => ({
      kind: 'artists',
      key: `r${item.name}`,
      score,
      artist: item,
    })),
    playlists: rank(listIndex.value, query).map(({ item, score }) => ({
      kind: 'playlists',
      key: `${item.play.kind}:${item.name}`,
      score,
      list: item,
    })),
    genres: rank(genreIndex.value, query).map(({ item, score }) => ({
      kind: 'genres',
      key: `g${item.name}`,
      score,
      genre: item,
    })),
  }
  const order = from ? [from, ...ORDER.filter((kind) => kind !== from)] : ORDER
  // The best first hit; a tie goes to the kind listed first.
  const top = order.reduce<Hit | null>((best, kind) => {
    const first = all[kind][0]
    return first && (!best || first.score > best.score) ? first : best
  }, null)
  const groups = order
    .map((kind) => ({ kind, hits: all[kind].filter((hit) => hit !== top) }))
    .filter((group) => group.hits.length > 0)
  return { top, groups }
}

/** Where a hit leads; a track leads nowhere (it plays). */
export function hitRoute(hit: Hit): RouteLocationRaw | null {
  switch (hit.kind) {
    case 'albums':
      return albumCardRoute(hit.album)
    case 'artists':
      return artistRoute(hit.artist.name)
    case 'playlists':
      return hit.list.to
    case 'genres':
      return genreRoute(hit.genre.name)
    case 'tracks':
      return null
  }
}

/** A hit's name. */
export function hitTitle(hit: Hit): string {
  switch (hit.kind) {
    case 'tracks':
      return hit.track.title
    case 'albums':
      return hit.album.title
    case 'artists':
      return hit.artist.name
    case 'playlists':
      return hit.list.name
    case 'genres':
      return hit.genre.name
  }
}

/** What a hit is, and whose: "Track · Northline". */
export function hitLine(hit: Hit): string {
  const parts: (string | null)[] = []
  switch (hit.kind) {
    case 'tracks':
      parts.push(t('kind_track'), hit.track.artist ? creditLabel(hit.track.artist) : null, hit.track.album)
      break
    case 'albums':
      parts.push(t('kind_album'), leadArtist(hit.album) ?? (hit.album.artists.length > 1 ? t('various_artists') : null))
      break
    case 'artists':
      parts.push(t('kind_artist'))
      break
    case 'playlists':
      parts.push(
        t(hit.list.auto ? 'kind_auto_playlist' : 'kind_playlist'),
        hit.list.count === null ? null : t('track_count', { count: hit.list.count }),
      )
      break
    case 'genres':
      parts.push(t('kind_genre'), t('track_count', { count: hit.genre.trackCount }))
      break
  }
  return parts.filter(Boolean).join(' · ')
}

/** A hit's observed cover or picture, when there is one. */
export function hitCover(hit: Hit): Blob | null {
  switch (hit.kind) {
    case 'tracks':
      return coverFor(hit.track)
    case 'albums':
      return albumCover(hit.album, albumScope(hit.album))
    case 'artists':
      return artistImage(hit.artist.name)
    default:
      return null
  }
}

/** The icon of a hit without artwork. */
export const hitIcon = (hit: Hit): IconName | null =>
  hit.kind === 'playlists' ? 'playlist' : hit.kind === 'genres' ? 'genre' : null

/** What Play selects for a hit: a track within the whole library; nothing for a genre. */
export function hitTarget(hit: Hit): SelectionTarget | null {
  switch (hit.kind) {
    case 'tracks':
      return { kind: 'library', track: { title: hit.track.title, artist: hit.track.artist } }
    case 'albums': {
      const artist = albumScope(hit.album)
      return artist
        ? { kind: 'artistAlbum', artist, album: hit.album.title }
        : { kind: 'album', album: hit.album.title }
    }
    case 'artists':
      return hit.artist.literal ? { kind: 'artist', artist: hit.artist.name } : null
    case 'playlists':
      return hit.list.play
    case 'genres':
      return null
  }
}
