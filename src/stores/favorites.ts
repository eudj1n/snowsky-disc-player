/**
 * Which tracks are favorites: the stock MY_LOVE snapshot, corrected by live
 * observations (`a202` reports `love` for the current track). Only the
 * current track can be changed (0104); other rows show state only.
 */
import { computed, reactive, watch } from 'vue'
import type { Track } from '../domain/track'
import { favorites, library } from './library'
import { playback } from './playback'

const observed = reactive(new Map<string, boolean>())
const snapshot = computed(() => new Set(favorites.value.flatMap((track) => (track.path ? [track.path] : []))))

watch(
  () => [playback.current.track?.path, playback.current.favorite] as const,
  ([path, favorite]) => {
    if (path && typeof favorite === 'boolean') observed.set(path, favorite)
  },
)
// A new snapshot already includes earlier changes.
watch(
  () => library.favorites,
  () => observed.clear(),
)

/** True or false when known; null for rows without a path. */
export function isFavorite(track: Pick<Track, 'path'>): boolean | null {
  if (!track.path) return null
  return observed.get(track.path) ?? snapshot.value.has(track.path)
}
