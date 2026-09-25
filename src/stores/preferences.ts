/** Small browser-local view preferences. */
import { ref, watch } from 'vue'
import { ALBUM_SORTS, type AlbumSort } from '../domain/album'
import { readPreference, writePreference } from '../lib/storage'

const KEY = 'disc-player.album-sort'
const saved = readPreference(KEY)
export const albumSort = ref<AlbumSort>(ALBUM_SORTS.includes(saved as AlbumSort) ? (saved as AlbumSort) : 'recent')
watch(albumSort, (value) => writePreference(KEY, value))
