<script setup lang="ts">
/**
 * Reference bottom player: current track and favorite, transport, modes and
 * timeline, output and volume, queue. Shown only while a track is observed.
 * While the player carries out a command, a thin line runs along its top
 * edge; nothing is locked (a press meanwhile waits its turn; 2026-09-29).
 * It shows and controls whichever side plays, the player or this browser,
 * and holds the one switch between them (owner, 2026-09-30).
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import NowPlayingSummary from '../components/player/NowPlayingSummary.vue'
import PlayerTools from '../components/player/PlayerTools.vue'
import PlayerTransport from '../components/player/PlayerTransport.vue'
import { t } from '../i18n'
import { connection } from '../stores/connection'
import { coverFor } from '../stores/enrichment'
import { switchSide } from '../stores/handoff'
import { imports } from '../stores/imports'
import { operation } from '../stores/operation'
import { playback } from '../stores/playback'
import { inBrowser, nowPlaying, nowPositionMs, output } from '../stores/output'
import { openDialog, togglePanel, ui } from '../stores/ui'
import { creditArtists, creditLabel } from '../domain/artist'
import { albumRoute, artistRoute } from '../views/captions'
import { usePlaybackContext } from './usePlaybackContext'
import { usePlayerControls } from './usePlayerControls'
import { openVisualizer } from './visualizer'

/*
 * The working strip: one strip for a run of operations (a transfer is one operation a file, owner
 * 2026-10-01: it blinked between files), gone only after a quiet moment.
 */
const working = ref(false)
let quiet: ReturnType<typeof setTimeout> | undefined
watch(
  () => operation.busy || imports.transferring,
  (busy) => {
    clearTimeout(quiet)
    if (busy) working.value = true
    else quiet = setTimeout(() => (working.value = false), 600)
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(quiet))

const player = usePlayerControls()
const track = player.track
const title = computed(() => track.value?.title ?? t('your_music_awaits'))
const subtitle = computed(
  () =>
    (track.value?.artist ? creditLabel(track.value.artist) : null) ??
    t(inBrowser.value || connection.connection === 'connected' ? 'choose_an_album' : 'connect_your_disc'),
)
/** The title opens the album in its artist scope (the artist without an album). */
const titleTo = computed(() => {
  const current = track.value
  if (current?.album) return albumRoute(current.album, current.artist)
  return current?.artist ? artistRoute(current.artist) : null
})
const context = usePlaybackContext()
const artistLinks = computed(() =>
  track.value?.artist ? creditArtists(track.value.artist).map((name) => ({ text: name, to: artistRoute(name) })) : null,
)
const labels = computed(() => ({
  shuffle: t('shuffle'),
  previous: t('previous_track'),
  play: t('play'),
  pause: t('pause'),
  next: t('next_track'),
  repeat: t(player.repeatOne.value ? 'repeat_one' : 'repeat_queue'),
  seek: t('seek_position'),
}))
</script>

<template>
  <section
    :aria-label="t('player')"
    class="fixed inset-x-0 bottom-0 z-30 grid min-h-(--player) grid-cols-[minmax(230px,1fr)_minmax(270px,1.2fr)_minmax(210px,1fr)] items-center gap-25 border-t border-line bg-player-bg px-28 py-15 backdrop-blur-[30px] backdrop-saturate-150 compact:grid-cols-[1fr_1fr_.65fr] compact:gap-15 compact:px-20 rail:grid-cols-[1fr_1fr_32px] rail:gap-14 phone:bottom-58 phone:min-h-78 phone:grid-cols-[minmax(0,1fr)_auto_auto] phone:gap-8 phone:px-14 phone:pt-11 phone:pb-14"
    :class="{ 'phone:hidden': ui.panel !== null }"
    :data-disc-state="playback.current.state"
  >
    <span
      v-if="working"
      aria-hidden="true"
      data-testid="player-working"
      class="player-working pointer-events-none absolute inset-x-0 -top-px h-2 overflow-hidden"
    />
    <NowPlayingSummary
      :open-label="t('open_now_playing')"
      :expanded="ui.panelTarget === 'now'"
      :title="title"
      :subtitle="subtitle"
      :artwork-title="track?.title ?? null"
      :cover="track ? coverFor(track) : null"
      :favorite-label="player.favoriteLabel.value"
      :favorite="nowPlaying.favorite"
      :favorite-disabled="player.favoriteDisabled.value"
      :title-to="titleTo"
      :subtitle-links="artistLinks"
      :context="context"
      @open="(opener) => togglePanel('now', opener)"
      @favorite="player.onFavorite"
    />
    <PlayerTransport
      :state="nowPlaying.state"
      :position-ms="nowPositionMs"
      :duration-ms="track?.durationMs ?? null"
      :identity="player.identity.value"
      :controls-disabled="player.controlsDisabled.value"
      :modes-disabled="player.modesDisabled.value"
      :shuffle-disabled="player.shuffleDisabled.value"
      :seek-disabled="player.seekDisabled.value"
      :shuffle="player.shuffle.value"
      :repeat="player.repeat.value"
      :repeat-one="player.repeatOne.value"
      :labels="labels"
      @transport="player.onTransport"
      @mode="player.onMode"
      @seek="player.onSeek"
    />
    <PlayerTools
      :side="output.side"
      :side-label="t(output.side === 'disc' ? 'side_disc' : 'side_browser')"
      :switching="output.switching"
      :visualizer-label="t('visualizer_open')"
      :volume="player.volume.value"
      :volume-disabled="player.volumeDisabled.value"
      :volume-label="t('disc_volume')"
      :volume-title="player.volumeTitle.value"
      :sound-label="t('sound_title')"
      :mute-label="t('mute')"
      :unmute-label="t('unmute')"
      :queue-label="t('open_queue')"
      :queue-expanded="ui.panelTarget === 'queue'"
      :lyrics-label="t('open_lyrics')"
      :lyrics-expanded="ui.panelTarget === 'lyrics'"
      :queue-disabled="!inBrowser && connection.connection !== 'connected'"
      @side="switchSide"
      @visualizer="openVisualizer"
      @queue="(opener) => togglePanel('queue', opener)"
      @lyrics="(opener) => togglePanel('lyrics', opener)"
      @volume="player.onVolume"
      @mute="player.onMute"
      @sound="openDialog('sound')"
    />
  </section>
</template>
