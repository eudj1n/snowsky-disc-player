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
import { toggleBrowser } from '../stores/browser'
import { inBrowser, nowIsPlaying, nowPlaying } from '../stores/output'
import { playback } from '../stores/playback'
import { openPlaylistDialog } from '../stores/ui'
import { artistRoute, trackAlbumRoute } from './captions'

/** The current row's button: pause or resume where it plays, never the track again from its start. */
export const toggleCurrent = (): void => (inBrowser.value ? toggleBrowser() : void transport('toggle'))

export const trackRowProps = computed(() => ({
  currentPath: nowPlaying.value.track?.path ?? null,
  currentTitle: nowPlaying.value.track?.title ?? null,
  currentCue: nowPlaying.value.track?.cue === true,
  playing: nowIsPlaying.value,
  coverOf: coverFor,
  playLabel: t('play_label'),
  // The current row pauses or resumes rather than starting the track again.
  pauseLabel: t('pause'),
  toggleCurrent,
  menuLabel: t('track_actions'),
  // A title opens its track in the panel; a double click on the row plays it (2026-09-30).
  openLabel: t('open_track'),
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
  favoriteAddable: favoritesAddable.value && controlsReady.value,
  onLove: onRowLove,
  favoriteRemovable: favoritesRemovable.value && controlsReady.value,
  // The player's current-track heart (0104); a track playing in this browser takes the any-row hearts.
  favoriteDisabled: inBrowser.value || !controlsReady.value || typeof playback.current.favorite !== 'boolean',
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
  if (typeof id === 'number') void favoriteTrack({ id, path: track.path, title: track.title, cue: track.cue === true })
}

/** A favorite that is not playing: confirmed first, as adding it back needs it playing. */
export const onRowUnfavorite = (track: Track): void => {
  openPlaylistDialog({ mode: 'unfavorite', track: { ...track } })
}

/** The heart of the current row: one guarded 0104 with readback. */
export const onRowFavorite = (): void => void toggleFavorite()
