/**
 * Props every track list in the views shares: current track and its state,
 * observed covers, row links, the favorite heart and play/actions labels.
 * Only the current track's favorite can change (stock 0104).
 */
import { computed } from 'vue'
import { t } from '../i18n'
import { controlsReady, toggleFavorite } from '../stores/controls'
import { coverFor } from '../stores/enrichment'
import { isFavorite } from '../stores/favorites'
import { operation } from '../stores/operation'
import { isPlaying, playback } from '../stores/playback'
import { selection } from '../stores/selection'
import { trackAlbumRoute, trackArtistRoute } from './captions'

export const trackRowProps = computed(() => ({
  currentPath: playback.current.track?.path ?? null,
  playing: isPlaying.value,
  coverOf: coverFor,
  disabled: selection.busy,
  playLabel: t('play_label'),
  menuLabel: t('track_actions'),
  artistTo: trackArtistRoute,
  albumTo: trackAlbumRoute,
  favoriteOf: isFavorite,
  favoriteLabels: {
    favorite: t('in_favorites'),
    add: t('favorite_the_current_track'),
    remove: t('unfavorite_the_current_track'),
    onlyCurrent: t('favorite_only_current'),
  },
  favoriteDisabled: !controlsReady.value || operation.busy || typeof playback.current.favorite !== 'boolean',
}))

/** The heart of the current row: one guarded 0104 with readback. */
export const onRowFavorite = (): void => void toggleFavorite()
