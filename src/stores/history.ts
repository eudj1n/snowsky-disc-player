/**
 * Play history for the home shelf and the track orders. Images with the play
 * observer (next image) keep it themselves (/api/history: every play with the
 * queue it came from); older ones only offer stock's RECORD_SONG, which V2.57
 * never fills. Read on demand and again after the playing track has had time
 * to count (30 s); kept in IndexedDB so the saved copy shows it offline.
 */
import { computed, reactive, readonly, watch } from 'vue'
import {
  pathsHash,
  playRecords,
  playSource,
  recentSources,
  servicePlayRecords,
  servicePlays,
  sourceIndex,
  type PlayRecord,
  type PlaySource,
  type ServicePlay,
} from '../domain/history'
import { rowsOf } from '../gateway/http'
import { cacheGet, cacheSet } from '../lib/idb'
import { connection, http } from './connection'
import { albums, favorites, library, loadPlaylistTracks, tracks } from './library'
import { playback } from './playback'

const CACHE = 'history:v2'
const LIMIT = 500
/** A play counts after 30 s of sound; the list is read again a little later. */
const REFRESH_AFTER_CHANGE_MS = 35000

interface HistoryModel {
  recent: PlayRecord[]
  most: PlayRecord[]
  plays: ServicePlay[]
  /** Playlists named by the hash of their members, read when a play needs them. */
  playlists: Record<string, { id: number; name: string; trackCount: number }>
  loaded: boolean
}
const state = reactive<HistoryModel>({ recent: [], most: [], plays: [], playlists: {}, loaded: false })
export const history = readonly(state)

/** Every queue the library can name, by the hash of its paths. */
const index = computed(() => {
  const map = sourceIndex({ albums: albums.value, tracks: tracks.value, favorites: favorites.value })
  for (const [hash, playlist] of Object.entries(state.playlists)) map.set(hash, { kind: 'playlist', playlist })
  return map
})

/** The sources the listener started, newest first (the home shelf). */
export const recentSourcesShown = computed(() =>
  recentSources(state.plays, (context) => playSource(context, index.value, albums.value), 8),
)

/** Where one play came from, for the track history. */
export function sourceOf(play: ServicePlay): PlaySource | null {
  return playSource(play.context, index.value, albums.value)
}

/** Plays whose queue matches no known source may be playlists of the same size: read those. */
const tried = new Set<number>()
async function resolvePlaylists(): Promise<void> {
  if (library.status !== 'ready') return
  const unknown = state.plays.filter((play) => play.context.hash && !index.value.has(play.context.hash))
  for (const playlist of library.playlists) {
    if (tried.has(playlist.id)) continue
    if (!unknown.some((play) => play.context.count === playlist.trackCount)) continue
    tried.add(playlist.id)
    try {
      const members = await loadPlaylistTracks(playlist.listId)
      const hash = pathsHash(members.flatMap((track) => (track.path ? [track.path] : [])))
      state.playlists = {
        ...state.playlists,
        [hash]: { id: playlist.id, name: playlist.name, trackCount: playlist.trackCount },
      }
    } catch {
      // Unread playlists stay unnamed.
    }
  }
}

let loading: Promise<void> | null = null
export function loadHistory(): Promise<void> {
  loading ??= (async () => {
    try {
      if (connection.history) {
        state.plays = servicePlays(await http.history()).slice(-LIMIT)
        state.most = servicePlayRecords(state.plays)
        state.recent = []
      } else {
        const [recent, most] = await Promise.all([
          http.data('recently_played', { limit: 60 }),
          http.data('most_played', { limit: LIMIT }),
        ])
        state.recent = playRecords(rowsOf(recent))
        state.most = playRecords(rowsOf(most))
      }
      await cacheSet(CACHE, { recent: state.recent, most: state.most, plays: state.plays })
      void resolvePlaylists()
    } catch {
      // Unreachable player or an older card catalog: the saved history, if any.
      const saved = await cacheGet<{ recent: PlayRecord[]; most: PlayRecord[]; plays?: ServicePlay[] }>(CACHE).catch(
        () => undefined,
      )
      if (saved && !state.loaded) {
        state.recent = saved.recent
        state.most = saved.most
        state.plays = saved.plays ?? []
      }
    } finally {
      state.loaded = true
      loading = null
    }
  })()
  return loading
}

// A page opened before the gateway answered read stock's (empty) history: the
// service's replaces it as soon as health says the service keeps one.
watch(
  () => connection.history,
  (keeps) => {
    // After a read already under way (it chose stock's history), read again.
    if (keeps) void Promise.resolve(loading).then(() => loadHistory())
  },
)

// The collection may arrive after the history (or change): name playlists again then.
watch(
  () => [library.status, library.playlists] as const,
  () => {
    tried.clear()
    void resolvePlaylists()
  },
)

let timer: ReturnType<typeof setTimeout> | undefined
watch(
  () => playback.current.track?.path ?? null,
  (path, previous) => {
    if (!path || path === previous || !state.loaded) return
    clearTimeout(timer)
    timer = setTimeout(() => void loadHistory(), REFRESH_AFTER_CHANGE_MS)
  },
)
