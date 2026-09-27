/**
 * Which tracks are favorites: the stock MY_LOVE snapshot, corrected by live
 * observations (`a202` reports `love` for the current track) and by favorites
 * the page added itself. Stock changes only the current track (0104); the
 * service (next image) can add any library track.
 */
import { computed, reactive, watch } from 'vue'
import { trackKey, type Track } from '../domain/track'
import { favorites, library } from './library'
import { playback } from './playback'

const observed = reactive(new Map<string, boolean>())
/* Keyed by trackKey: a CUE sheet's tracks share a path, so their titles count too. */
const snapshot = computed(() => new Set(favorites.value.flatMap((track) => trackKey(track) ?? [])))

watch(
  () => [playback.current.track ? trackKey(playback.current.track) : null, playback.current.favorite] as const,
  ([key, favorite]) => {
    if (key && typeof favorite === 'boolean') observed.set(key, favorite)
  },
)
// A new snapshot already includes earlier changes.
watch(
  () => library.favorites,
  () => observed.clear(),
)

/** True or false when known; null for rows without a path. */
export function isFavorite(track: Pick<Track, 'path' | 'title' | 'cue'>): boolean | null {
  const key = trackKey(track)
  if (!key) return null
  return observed.get(key) ?? snapshot.value.has(key)
}

/** A favorite the page just confirmed, shown before the next list read. */
export function markFavorite(track: Pick<Track, 'path' | 'title' | 'cue'>, favorite: boolean): void {
  const key = trackKey(track)
  if (key) observed.set(key, favorite)
}
