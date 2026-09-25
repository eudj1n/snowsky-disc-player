/**
 * The collection as the stock databases hold it, read through the gateway's
 * data level. Browsing needs no owner session. Reads are bounded like the
 * reference Library; a failed read keeps what was shown before.
 */
import { computed, reactive, readonly } from 'vue'
import { groupAlbums } from '../domain/album'
import { groupArtists } from '../domain/artist'
import type { LibrarySummary } from '../domain/library'
import type { Playlist } from '../domain/playlist'
import type { LibraryTrack } from '../domain/track'
import { librarySummary, libraryTracks, playlists as playlistRows } from '../gateway/library'
import { playerLanguage } from '../gateway/settings'
import { adoptPlayerLanguage } from '../i18n'
import { http } from './connection'

/** Same bound as the reference Library synchronization. */
export const MAX_TRACKS = 10_000
const PAGE = 500

type Status = 'idle' | 'loading' | 'ready' | 'failed'

interface LibraryModel {
  summary: LibrarySummary | null
  tracks: LibraryTrack[]
  favorites: LibraryTrack[]
  playlists: Playlist[]
  status: Status
  /** More tracks exist than MAX_TRACKS. */
  truncated: boolean
}

const state = reactive<LibraryModel>({
  summary: null,
  tracks: [],
  favorites: [],
  playlists: [],
  status: 'idle',
  truncated: false,
})
export const library = readonly(state)
export const albums = computed(() => groupAlbums(state.tracks))
export const artists = computed(() => groupArtists(state.tracks))

/** One album chosen at random per page load for the Home hero. */
const seed = Math.random()
export const featuredAlbum = computed(() => {
  const list = albums.value
  return list.length ? (list[Math.floor(seed * list.length)] ?? null) : null
})

async function pages(query: string): Promise<LibraryTrack[]> {
  const rows: LibraryTrack[] = []
  for (let offset = 0; offset < MAX_TRACKS; offset += PAGE) {
    const page = await http.data(query, { limit: PAGE, offset })
    rows.push(...libraryTracks(page))
    if (page.rows_returned < PAGE && !page.truncated) break
  }
  return rows
}

/** Settings (player language) and counts; cheap, used before the full read. */
export async function loadLibraryFacts(): Promise<void> {
  const [settings, summary] = await Promise.allSettled([http.data('system_settings'), http.data('library_summary')])
  if (settings.status === 'fulfilled') adoptPlayerLanguage(playerLanguage(settings.value))
  if (summary.status === 'fulfilled') state.summary = librarySummary(summary.value)
}

/** Reads tracks, favorites and playlists. */
export async function loadCollection(): Promise<void> {
  if (state.status === 'loading') return
  state.status = 'loading'
  try {
    const [tracks, favorites, lists] = await Promise.all([pages('tracks'), pages('favorites'), http.data('playlists')])
    state.tracks = tracks
    state.favorites = favorites
    state.playlists = playlistRows(lists)
    state.truncated = (state.summary?.tracks ?? 0) > MAX_TRACKS
    state.status = 'ready'
  } catch {
    state.status = 'failed'
  }
}

/** Tracks of one custom playlist, in stock list order. */
export async function loadPlaylistTracks(id: number): Promise<LibraryTrack[]> {
  const rows: LibraryTrack[] = []
  for (let offset = 0; offset < MAX_TRACKS; offset += PAGE) {
    const page = await http.data('playlist_tracks', { id, limit: PAGE, offset })
    rows.push(...libraryTracks(page))
    if (page.rows_returned < PAGE && !page.truncated) break
  }
  return rows
}
