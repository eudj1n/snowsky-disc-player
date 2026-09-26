/**
 * Stock's play history for the home shelf and the "most played" order. Read
 * on demand and again a few seconds after the playing track changes (stock
 * records a play on its own schedule); kept in IndexedDB so the saved copy
 * shows it while the player is unreachable.
 */
import { reactive, readonly, watch } from 'vue'
import { playRecords, type PlayRecord } from '../domain/history'
import { rowsOf } from '../gateway/http'
import { cacheGet, cacheSet } from '../lib/idb'
import { http } from './connection'
import { playback } from './playback'

const CACHE = 'history:v1'
const LIMIT = 500
const REFRESH_AFTER_CHANGE_MS = 8000

const state = reactive<{ recent: PlayRecord[]; most: PlayRecord[]; loaded: boolean }>({
  recent: [],
  most: [],
  loaded: false,
})
export const history = readonly(state)

let loading: Promise<void> | null = null
export function loadHistory(): Promise<void> {
  loading ??= (async () => {
    try {
      const [recent, most] = await Promise.all([
        http.data('recently_played', { limit: 60 }),
        http.data('most_played', { limit: LIMIT }),
      ])
      state.recent = playRecords(rowsOf(recent))
      state.most = playRecords(rowsOf(most))
      await cacheSet(CACHE, { recent: state.recent, most: state.most })
    } catch {
      // Unreachable player or an older card catalog: the saved history, if any.
      const saved = await cacheGet<{ recent: PlayRecord[]; most: PlayRecord[] }>(CACHE).catch(() => undefined)
      if (saved && !state.loaded) {
        state.recent = saved.recent
        state.most = saved.most
      }
    } finally {
      state.loaded = true
      loading = null
    }
  })()
  return loading
}

let timer: ReturnType<typeof setTimeout> | undefined
watch(
  () => playback.current.track?.path ?? null,
  (path, previous) => {
    if (!path || path === previous || !state.loaded) return
    clearTimeout(timer)
    timer = setTimeout(() => void loadHistory(), REFRESH_AFTER_CHANGE_MS)
  },
)
