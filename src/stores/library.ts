/**
 * The collection as the stock databases hold it, read through the gateway's
 * data level. Browsing needs no owner session. Reads are bounded like the
 * reference Library; a failed read keeps what was shown before.
 *
 * A snapshot is cached in IndexedDB with the library signature (counts,
 * latest addition, highest ID from library_summary): while the signature is
 * unchanged, the page opens from the cache without paging the player.
 */
import { computed, reactive, readonly } from 'vue'
import { groupAlbums } from '../domain/album'
import { groupArtists } from '../domain/artist'
import { groupGenres } from '../domain/genre'
import { librarySignature, type LibrarySummary } from '../domain/library'
import type { Playlist } from '../domain/playlist'
import type { LibraryTrack } from '../domain/track'
import { librarySummary, libraryTracks, playlists as playlistRows } from '../gateway/library'
import { playerLanguage } from '../gateway/settings'
import { adoptPlayerLanguage } from '../i18n'
import { cacheGet, cacheSet } from '../lib/idb'
import { http } from './connection'
import { enrichment, wantDurations } from './enrichment'

/** Same bound as the reference Library synchronization. */
export const MAX_TRACKS = 10_000
const PAGE = 500
const SNAPSHOT = 'collection:v1'

type Status = 'idle' | 'loading' | 'ready' | 'failed'

interface Snapshot {
  signature: string
  /** When the snapshot was read from the player (ms); absent in older caches. */
  savedAt?: number
  tracks: LibraryTrack[]
  favorites: LibraryTrack[]
  playlists: Playlist[]
}

interface LibraryModel {
  summary: LibrarySummary | null
  tracks: LibraryTrack[]
  favorites: LibraryTrack[]
  playlists: Playlist[]
  status: Status
  /** More tracks exist than MAX_TRACKS. */
  truncated: boolean
  /** Where the shown collection comes from: the player, or a saved copy while it is unreachable. */
  source: 'player' | 'saved' | null
  /** When the shown collection was read from the player (ms), when known. */
  savedAt: number | null
}

const state = reactive<LibraryModel>({
  summary: null,
  tracks: [],
  favorites: [],
  playlists: [],
  status: 'idle',
  truncated: false,
  source: null,
  savedAt: null,
})
export const library = readonly(state)

/** Durations the database lacks, filled from listening observations. */
function enriched(tracks: readonly LibraryTrack[]): LibraryTrack[] {
  return tracks.map((track) =>
    track.durationMs === null && track.path && enrichment.durations[track.path]
      ? { ...track, durationMs: enrichment.durations[track.path] ?? null }
      : track,
  )
}
export const tracks = computed(() => enriched(state.tracks))
export const favorites = computed(() => enriched(state.favorites))
export const albums = computed(() => groupAlbums(state.tracks))
export const artists = computed(() => groupArtists(state.tracks))
export const genres = computed(() => groupGenres(state.tracks))
/** Library rows by path, for the context of what is playing. */
export const trackByPath = computed(
  () => new Map(state.tracks.flatMap((track) => (track.path ? [[track.path, track] as const] : []))),
)

/** One album chosen at random per page load for the Home hero. */
const seed = Math.random()
export const featuredAlbum = computed(() => {
  const list = albums.value
  return list.length ? (list[Math.floor(seed * list.length)] ?? null) : null
})

async function pages(query: string, params: Record<string, number> = {}): Promise<LibraryTrack[]> {
  const rows: LibraryTrack[] = []
  for (let offset = 0; offset < MAX_TRACKS; offset += PAGE) {
    const page = await http.data(query, { ...params, limit: PAGE, offset })
    rows.push(...libraryTracks(page))
    if (page.rows_returned < PAGE && !page.truncated) break
  }
  return rows
}

/** Settings (player language) and counts; cheap, read before the collection. */
export async function loadLibraryFacts(): Promise<void> {
  const [settings, summary] = await Promise.allSettled([http.data('system_settings'), http.data('library_summary')])
  if (settings.status === 'fulfilled') adoptPlayerLanguage(playerLanguage(settings.value))
  if (summary.status === 'fulfilled') state.summary = librarySummary(summary.value)
}

function apply(snapshot: Omit<Snapshot, 'signature'>, source: 'player' | 'saved' = 'player'): void {
  state.source = source
  state.savedAt = snapshot.savedAt ?? null
  state.tracks = snapshot.tracks
  state.favorites = snapshot.favorites
  state.playlists = snapshot.playlists
  state.truncated = (state.summary?.tracks ?? 0) > MAX_TRACKS
  state.status = 'ready'
  // Durations the database lacks come from the files when the gateway serves media.
  if (source === 'player') wantDurations(snapshot.tracks)
}

/**
 * Tracks, favorites and playlists. Uses the cached snapshot when the library
 * signature is unchanged unless `force` (the refresh button, a finished scan).
 */
export async function loadCollection(force = false): Promise<void> {
  if (state.status === 'loading') return
  state.status = state.tracks.length ? state.status : 'loading'
  if (force) await loadLibraryFacts()
  const signature = state.summary ? librarySignature(state.summary) : null
  if (!force && signature) {
    const cached = await cacheGet<Snapshot>(SNAPSHOT)
    if (cached?.signature === signature) {
      apply(cached)
      return
    }
  }
  state.status = 'loading'
  try {
    const [trackRows, favoriteRows, lists] = await Promise.all([
      pages('tracks'),
      pages('favorites'),
      http.data('playlists'),
    ])
    const snapshot = { savedAt: Date.now(), tracks: trackRows, favorites: favoriteRows, playlists: playlistRows(lists) }
    apply(snapshot)
    if (signature) await cacheSet(SNAPSHOT, { signature, ...snapshot })
  } catch {
    state.status = state.tracks.length ? 'ready' : 'failed'
  }
}

/**
 * The last saved snapshot, whatever its signature, for browsing while the
 * player is unreachable (plan M6). Playback and changes stay disabled; the
 * shown copy is labelled with its date.
 */
export async function loadSavedCollection(): Promise<boolean> {
  if (state.tracks.length) {
    state.source = 'saved'
    return true
  }
  const cached = await cacheGet<Snapshot>(SNAPSHOT).catch(() => undefined)
  if (!cached?.tracks.length) return false
  apply(cached, 'saved')
  return true
}

/** Stock play history (RECORD_SONG), newest first. */
export async function loadRecentlyPlayed(limit = 12): Promise<LibraryTrack[]> {
  return enriched(libraryTracks(await http.data('recently_played', { limit })))
}

/**
 * Tracks of one custom playlist (data level, ID order). The query addresses
 * the list by CUSTOM_PLAYLIST_INDEX.LIST_ID, not its row ID: the first list
 * has LIST_ID 0 (found on the emulator).
 */
export async function loadPlaylistTracks(listId: number): Promise<LibraryTrack[]> {
  return enriched(await pages('playlist_tracks', { id: listId }))
}
