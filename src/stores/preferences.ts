/** Small browser-local view preferences. */
import { ref, watch } from 'vue'
import { ALBUM_SORTS, type AlbumSort } from '../domain/album'
import { TRACK_SORTS, type TrackSort } from '../domain/history'
import { readPreference, writePreference } from '../lib/storage'

const KEY = 'disc-player.album-sort'
const saved = readPreference(KEY)
export const albumSort = ref<AlbumSort>(ALBUM_SORTS.includes(saved as AlbumSort) ? (saved as AlbumSort) : 'recent')
watch(albumSort, (value) => writePreference(KEY, value))

const TRACK_KEY = 'disc-player.track-sort'
const savedTrackSort = readPreference(TRACK_KEY)
export const trackSort = ref<TrackSort>(
  TRACK_SORTS.includes(savedTrackSort as TrackSort) ? (savedTrackSort as TrackSort) : 'library',
)
watch(trackSort, (value) => writePreference(TRACK_KEY, value))
