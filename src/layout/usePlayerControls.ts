/**
 * Shared wiring of the mini-player and the Now Playing panel: the reference
 * disabled rules (app.js updatePlayer) and handlers for transport, modes,
 * favorite, seek and volume. Seek feedback reconciles a paused seek on every
 * position tick. Since 2026-09-30 the same controls work on whichever side
 * plays (stores/output.ts): the player through its guarded commands, this
 * browser at once. Shuffle stays with the player.
 */
import { computed, watch } from 'vue'
import type { TransportAction } from '../domain/playback'
import type { LibraryTrack } from '../domain/track'
import { identityOf } from '../gateway/controls'
import { t } from '../i18n'
import {
  browserPlayback,
  nextInBrowser,
  previousInBrowser,
  seekInBrowser,
  setBrowserRepeat,
  setBrowserVolume,
  toggleBrowser,
} from '../stores/browser'
import { connection } from '../stores/connection'
import {
  MODE,
  changeVolume,
  toggleMute,
  controls,
  controlsReady,
  favoriteTrack,
  reconcileSeek,
  seekTo,
  toggleFavorite,
  toggleMode,
  transport,
} from '../stores/controls'
import { trackByPath } from '../stores/library'
import { observations } from '../stores/observations'
import { inBrowser, nowPlaying } from '../stores/output'
import { playback, rememberedPlayback } from '../stores/playback'
import { openPlaylistDialog, toast } from '../stores/ui'
import { readPreference, writePreference } from '../lib/storage'

const BROWSER_VOLUME_BEFORE_MUTE = 'disc-player.browser-volume-before-mute'

/** Repeat goes round as on the player: the queue, then one track, then off. */
const nextRepeat = (repeat: 'off' | 'all' | 'one') => (repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')

export function usePlayerControls() {
  const ready = computed(() => (inBrowser.value ? nowPlaying.value.track !== null : controlsReady.value))
  const track = computed(() => nowPlaying.value.track)
  const identity = computed(() =>
    inBrowser.value
      ? track.value
        ? `browser:${browserPlayback.index}:${track.value.path ?? ''}`
        : null
      : identityOf(playback.current),
  )
  const controlsDisabled = computed(() => !ready.value || !track.value)
  const modesDisabled = computed(() => (inBrowser.value ? !track.value : !ready.value || observations.mode === null))
  /** This browser does not shuffle yet (owner, 2026-09-30). */
  const shuffleDisabled = computed(() => inBrowser.value || modesDisabled.value)
  /** The library row of the browser's track: the heart needs its ID. */
  const browserRow = computed<LibraryTrack | null>(() =>
    inBrowser.value && track.value?.path ? (trackByPath.value.get(track.value.path) ?? null) : null,
  )
  const favoriteDisabled = computed(() =>
    inBrowser.value
      ? !controlsReady.value || !browserRow.value || typeof nowPlaying.value.favorite !== 'boolean'
      : controlsDisabled.value || typeof playback.current.favorite !== 'boolean',
  )
  const volumeDisabled = computed(() => (inBrowser.value ? false : !ready.value))
  const volume = computed(() => (inBrowser.value ? browserPlayback.volume : connection.volume))
  // A remembered track (stock reports nothing) only plays; it cannot be sought yet.
  const seekDisabled = computed(() =>
    inBrowser.value
      ? !track.value || (track.value.durationMs ?? 0) < 1000
      : !ready.value ||
        rememberedPlayback.value !== null ||
        (playback.current.state !== 'playing' && playback.current.state !== 'paused') ||
        (track.value?.durationMs ?? 0) < 1000,
  )
  const shuffle = computed(() => !inBrowser.value && observations.mode === MODE.random)
  const repeat = computed(() =>
    inBrowser.value
      ? browserPlayback.repeat !== 'off'
      : observations.mode === MODE.repeatList || observations.mode === MODE.repeatOne,
  )
  const repeatOne = computed(() =>
    inBrowser.value ? browserPlayback.repeat === 'one' : observations.mode === MODE.repeatOne,
  )
  const seekFeedback = computed(() =>
    !inBrowser.value && controls.seekFeedback
      ? t(controls.seekFeedback.key, { position: controls.seekFeedback.position ?? '' })
      : null,
  )
  const favoriteLabel = computed(() =>
    t(nowPlaying.value.favorite ? 'unfavorite_the_current_track' : 'favorite_the_current_track'),
  )
  const volumeTitle = computed(() =>
    volume.value === null ? t('volume_unknown') : t('volume_value', { value: volume.value }),
  )

  watch([() => observations.positionMs, () => playback.current], () => reconcileSeek())

  function onTransport(action: TransportAction): void {
    if (!inBrowser.value) {
      void transport(action)
      return
    }
    if (action === 'toggle') toggleBrowser()
    else if (action === 'next') nextInBrowser()
    else previousInBrowser()
  }

  function onFavorite(): void {
    if (!inBrowser.value) {
      void toggleFavorite()
      return
    }
    const row = browserRow.value
    if (!row) return
    // As on the rows: adding is one guarded request, removing asks first.
    if (nowPlaying.value.favorite) openPlaylistDialog({ mode: 'unfavorite', track: { ...row } })
    else void favoriteTrack({ id: row.id, path: row.path, title: row.title, cue: row.cue === true })
  }

  function onMute(): void {
    if (!inBrowser.value) {
      void toggleMute()
      return
    }
    if (browserPlayback.volume > 0) {
      writePreference(BROWSER_VOLUME_BEFORE_MUTE, String(browserPlayback.volume))
      setBrowserVolume(0)
    } else setBrowserVolume(Number(readPreference(BROWSER_VOLUME_BEFORE_MUTE)) || 60)
  }

  return {
    ready,
    track,
    identity,
    controlsDisabled,
    modesDisabled,
    shuffleDisabled,
    favoriteDisabled,
    volumeDisabled,
    volume,
    seekDisabled,
    shuffle,
    repeat,
    repeatOne,
    seekFeedback,
    favoriteLabel,
    volumeTitle,
    onTransport,
    onMode: (kind: 'shuffle' | 'repeat') => {
      if (!inBrowser.value) void toggleMode(kind)
      else if (kind === 'repeat') setBrowserRepeat(nextRepeat(browserPlayback.repeat))
    },
    onFavorite,
    onVolume: (value: number) => (inBrowser.value ? setBrowserVolume(value) : void changeVolume(value)),
    onMute,
    onSeek: (seconds: number, captured: string) => {
      if (captured !== identity.value) {
        toast('track_changed', true)
        return
      }
      if (inBrowser.value) seekInBrowser(seconds * 1000)
      else void seekTo(seconds, captured)
    },
  }
}
