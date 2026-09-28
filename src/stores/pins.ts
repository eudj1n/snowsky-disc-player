/**
 * Pinned artists and albums (owner, round 16 item 8; combined-008): kept on
 * the service's store, so every browser shows the same pins at the top of
 * Home and of the artist and album lists. A change needs the pairing serial
 * number and is confirmed by the service's reply.
 */
import { computed, reactive, readonly, watch } from 'vue'
import type { Album } from '../domain/album'
import { deleteRecord, putRecord, readCollection } from '../gateway/store'
import { connection, http } from './connection'
import { pairingToken } from './pairing'
import { toast } from './ui'

interface ArtistPin {
  name: string
  at: number
}
interface AlbumPin {
  album: string
  title?: string
  artist?: string
  at: number
}

const state = reactive({ artists: [] as ArtistPin[], albums: [] as AlbumPin[], available: false, busy: false })
export const pins = readonly(state)

const artistNames = computed(() => new Set(state.artists.map((pin) => pin.name)))
const albumKeys = computed(() => new Set(state.albums.map((pin) => pin.album)))

export const isPinnedArtist = (name: string): boolean => artistNames.value.has(name)
export const isPinnedAlbum = (album: Pick<Album, 'key'>): boolean => albumKeys.value.has(album.key)

/** Pinned first (newest pin first), the rest in their order. */
export function pinnedFirst<T>(items: readonly T[], pinnedAt: (item: T) => number | null): T[] {
  return items
    .map((item, index) => ({ item, index, at: pinnedAt(item) }))
    .sort((a, b) => (b.at ?? -1) - (a.at ?? -1) || a.index - b.index)
    .map((entry) => entry.item)
}
export const artistPinnedAt = (name: string): number | null =>
  state.artists.find((pin) => pin.name === name)?.at ?? null
export const albumPinnedAt = (album: Pick<Album, 'key'>): number | null =>
  state.albums.find((pin) => pin.album === album.key)?.at ?? null

export async function loadPins(): Promise<void> {
  if (!connection.store) return
  try {
    const [artists, albums] = await Promise.all([
      readCollection<ArtistPin>(http, 'pinned_artists'),
      readCollection<AlbumPin>(http, 'pinned_albums'),
    ])
    state.available = artists !== null && albums !== null
    state.artists = (artists ?? []).map((record) => record.value).filter((pin) => typeof pin.name === 'string')
    state.albums = (albums ?? []).map((record) => record.value).filter((pin) => typeof pin.album === 'string')
  } catch {
    // Unreachable for now: the last pins stay.
  }
}
watch(
  () => connection.store,
  (store) => {
    if (store) void loadPins()
  },
  { immediate: true },
)

async function change(task: (token: string) => Promise<string>, pinned: boolean): Promise<void> {
  const token = pairingToken()
  if (!token) {
    toast('pair_to_control')
    return
  }
  if (state.busy) {
    toast('please_wait_for_the_current_request')
    return
  }
  state.busy = true
  try {
    const outcome = await task(token)
    if (outcome === 'confirmed') toast(pinned ? 'unpinned' : 'pinned')
    else if (outcome === 'full') toast('pins_full', true)
    else toast('result_unconfirmed_the_command_was_not_retried', true)
  } catch {
    toast('result_unconfirmed_the_command_was_not_retried', true)
  } finally {
    state.busy = false
    await loadPins()
  }
}

export function togglePinArtist(name: string): Promise<void> {
  const pinned = isPinnedArtist(name)
  return change(
    (token) =>
      pinned
        ? deleteRecord(http, 'pinned_artists', { name }, token)
        : putRecord(http, 'pinned_artists', { name: name.slice(0, 255), at: Math.floor(Date.now() / 1000) }, token),
    pinned,
  )
}

export function togglePinAlbum(album: Pick<Album, 'key' | 'title' | 'artists'>): Promise<void> {
  const pinned = isPinnedAlbum(album)
  const record: AlbumPin = { album: album.key, title: album.title.slice(0, 255), at: Math.floor(Date.now() / 1000) }
  if (album.artists[0]) record.artist = album.artists[0].slice(0, 255)
  return change(
    (token) =>
      pinned
        ? deleteRecord(http, 'pinned_albums', { album: album.key }, token)
        : putRecord(http, 'pinned_albums', { ...record }, token),
    pinned,
  )
}
