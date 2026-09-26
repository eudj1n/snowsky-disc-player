/**
 * Props every track list in the views shares: current track and its state,
 * observed covers, row links, the favorite heart and play/actions labels.
 * Only the current track's favorite can change (stock 0104).
 */
import { computed } from 'vue'
import { t } from '../i18n'
import type { LibraryTrack, Track } from '../domain/track'
import { commandCatalog, connection } from '../stores/connection'
import { controlsReady, favoriteTrack, toggleFavorite, transport } from '../stores/controls'
import { coverFor } from '../stores/enrichment'
import { isFavorite } from '../stores/favorites'
import { operation } from '../stores/operation'
import { isPlaying, playback } from '../stores/playback'
import { selection } from '../stores/selection'
import { openPlaylistDialog } from '../stores/ui'
import { artistRoute, trackAlbumRoute } from './captions'

/** The current row's button: pause or resume, never the track again from its start. */
export const toggleCurrent = (): void => void transport('toggle')

export const trackRowProps = computed(() => ({
  currentPath: playback.current.track?.path ?? null,
  playing: isPlaying.value,
  coverOf: coverFor,
  disabled: selection.busy,
  playLabel: t('play_label'),
  // The current row pauses or resumes rather than starting the track again.
  pauseLabel: t('pause'),
  toggleCurrent,
  menuLabel: t('track_actions'),
  artistTo: artistRoute,
  albumTo: trackAlbumRoute,
  favoriteOf: isFavorite,
  favoriteLabels: {
    favorite: t('in_favorites'),
    add: t('favorite_the_current_track'),
    remove: t('unfavorite_the_current_track'),
    onlyCurrent: t('favorite_only_current'),
    removeAny: t('remove_from_favorites'),
    addAny: t('add_to_favorites'),
  },
  // Any library row can be favorited where the service and the card admit it (next image).
  favoriteAddable: favoritesAddable.value && controlsReady.value && !operation.busy,
  onLove: onRowLove,
  favoriteRemovable: favoritesRemovable.value && controlsReady.value && !operation.busy,
  favoriteDisabled: !controlsReady.value || operation.busy || typeof playback.current.favorite !== 'boolean',
}))

/** The catalog on the card admits removing favorites (love/song, service combined-006). */
const favoritesRemovable = computed(() =>
  Boolean(
    commandCatalog()
      ?.http?.find((route) => route.name === 'playlist_remove')
      ?.headers?.type?.split('|')
      .includes('love/song'),
  ),
)

/** The service favorites any track and the card's catalog admits it (favorite_add). */
const favoritesAddable = computed(
  () => connection.favoriteAny && Boolean(commandCatalog()?.data?.some((entry) => entry.name === 'favorite_add')),
)

/** A row's heart when the service can favorite any library track. */
export const onRowLove = (track: Track): void => {
  const id = (track as Partial<LibraryTrack>).id
  if (typeof id === 'number') void favoriteTrack({ id, path: track.path })
}

/** A favorite that is not playing: confirmed first, as adding it back needs it playing. */
export const onRowUnfavorite = (track: Track): void => {
  openPlaylistDialog({ mode: 'unfavorite', track: { ...track } })
}

/** The heart of the current row: one guarded 0104 with readback. */
export const onRowFavorite = (): void => void toggleFavorite()
