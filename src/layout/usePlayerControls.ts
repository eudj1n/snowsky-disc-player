/**
 * Shared wiring of the mini-player and the Now Playing panel: the reference
 * disabled rules (app.js updatePlayer) and handlers for transport, modes,
 * favorite, seek and volume. Seek feedback reconciles a paused seek on every
 * position tick.
 */
import { computed, watch } from 'vue'
import type { TransportAction } from '../domain/playback'
import { identityOf } from '../gateway/controls'
import { t } from '../i18n'
import { connection } from '../stores/connection'
import {
  MODE,
  changeVolume,
  toggleMute,
  controls,
  reconcileSeek,
  seekTo,
  toggleFavorite,
  toggleMode,
  transport,
} from '../stores/controls'
import { observations } from '../stores/observations'
import { operation } from '../stores/operation'
import { playback, rememberedPlayback } from '../stores/playback'
import { toast } from '../stores/ui'

export function usePlayerControls() {
  const ready = computed(() => connection.connection === 'connected' && connection.identity?.compatible === true)
  const track = computed(() => playback.current.track)
  const identity = computed(() => identityOf(playback.current))
  const controlsDisabled = computed(() => !ready.value || operation.busy || !track.value)
  const modesDisabled = computed(() => !ready.value || operation.busy || observations.mode === null)
  const favoriteDisabled = computed(() => controlsDisabled.value || typeof playback.current.favorite !== 'boolean')
  const volumeDisabled = computed(() => !ready.value || operation.busy)
  // A remembered track (stock reports nothing) only plays; it cannot be sought yet.
  const seekDisabled = computed(
    () =>
      !ready.value ||
      operation.busy ||
      rememberedPlayback.value !== null ||
      (playback.current.state !== 'playing' && playback.current.state !== 'paused') ||
      (track.value?.durationMs ?? 0) < 1000,
  )
  const shuffle = computed(() => observations.mode === MODE.random)
  const repeat = computed(() => observations.mode === MODE.repeatList)
  const seekFeedback = computed(() =>
    controls.seekFeedback ? t(controls.seekFeedback.key, { position: controls.seekFeedback.position ?? '' }) : null,
  )
  const favoriteLabel = computed(() =>
    t(playback.current.favorite ? 'unfavorite_the_current_track' : 'favorite_the_current_track'),
  )
  const volumeTitle = computed(() =>
    connection.volume === null ? t('volume_unknown') : t('volume_value', { value: connection.volume }),
  )

  watch([() => observations.positionMs, () => playback.current], () => reconcileSeek())

  return {
    ready,
    track,
    identity,
    controlsDisabled,
    modesDisabled,
    favoriteDisabled,
    volumeDisabled,
    seekDisabled,
    shuffle,
    repeat,
    seekFeedback,
    favoriteLabel,
    volumeTitle,
    onTransport: (action: TransportAction) => void transport(action),
    onMode: (kind: 'shuffle' | 'repeat') => void toggleMode(kind),
    onFavorite: () => void toggleFavorite(),
    onVolume: (value: number) => void changeVolume(value),
    onMute: () => void toggleMute(),
    onSeek: (seconds: number, captured: string) => {
      if (captured !== identity.value) {
        toast('track_changed', true)
        return
      }
      void seekTo(seconds, captured)
    },
  }
}
