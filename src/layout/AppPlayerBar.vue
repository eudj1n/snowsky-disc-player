<script setup lang="ts">
/**
 * Reference bottom player: current track and favorite, transport, modes and
 * timeline, output and volume, queue. Shown only while a track is observed.
 */
import { computed } from 'vue'
import NowPlayingSummary from '../components/player/NowPlayingSummary.vue'
import PlayerTools from '../components/player/PlayerTools.vue'
import PlayerTransport from '../components/player/PlayerTransport.vue'
import { t } from '../i18n'
import { connection } from '../stores/connection'
import { coverFor } from '../stores/enrichment'
import { observations } from '../stores/observations'
import { playback } from '../stores/playback'
import { togglePanel, ui } from '../stores/ui'
import { albumRoute, artistRoute } from '../views/captions'
import { usePlaybackContext } from './usePlaybackContext'
import { usePlayerControls } from './usePlayerControls'

const player = usePlayerControls()
const track = player.track
const title = computed(() => track.value?.title ?? t('your_music_awaits'))
const subtitle = computed(
  () => track.value?.artist ?? t(connection.connection === 'connected' ? 'choose_an_album' : 'connect_your_disc'),
)
/** The title opens the album in its artist scope (the artist without an album). */
const titleTo = computed(() => {
  const current = track.value
  if (current?.album) return albumRoute(current.album, current.artist)
  return current?.artist ? artistRoute(current.artist) : null
})
const context = usePlaybackContext()
const artistTo = computed(() => (track.value?.artist ? artistRoute(track.value.artist) : null))
const labels = computed(() => ({
  shuffle: t('shuffle'),
  previous: t('previous_track'),
  play: t('play'),
  pause: t('pause'),
  next: t('next_track'),
  repeat: t('repeat_queue'),
  seek: t('seek_position'),
}))
</script>

<template>
  <section
    :aria-label="t('player')"
    class="fixed inset-x-0 bottom-0 z-30 grid min-h-(--player) grid-cols-[minmax(230px,1fr)_minmax(270px,1.2fr)_minmax(210px,1fr)] items-center gap-25 border-t border-line bg-player-bg px-28 py-15 backdrop-blur-[22px] compact:grid-cols-[1fr_1fr_.65fr] compact:gap-15 compact:px-20 rail:grid-cols-[1fr_1fr_32px] rail:gap-14 phone:bottom-58 phone:min-h-78 phone:grid-cols-[1fr_78px_28px] phone:gap-10 phone:px-14 phone:pt-11 phone:pb-14"
  >
    <NowPlayingSummary
      :open-label="t('open_now_playing')"
      :expanded="ui.panel === 'now'"
      :title="title"
      :subtitle="subtitle"
      :artwork-title="track?.title ?? null"
      :cover="track ? coverFor(track) : null"
      :favorite-label="player.favoriteLabel.value"
      :favorite="playback.current.favorite"
      :favorite-disabled="player.favoriteDisabled.value"
      :title-to="titleTo"
      :subtitle-to="artistTo"
      :context="context"
      @open="(opener) => togglePanel('now', opener)"
      @favorite="player.onFavorite"
    />
    <PlayerTransport
      :state="playback.current.state"
      :position-ms="observations.positionMs"
      :duration-ms="track?.durationMs ?? null"
      :identity="player.identity.value"
      :controls-disabled="player.controlsDisabled.value"
      :modes-disabled="player.modesDisabled.value"
      :seek-disabled="player.seekDisabled.value"
      :shuffle="player.shuffle.value"
      :repeat="player.repeat.value"
      :labels="labels"
      @transport="player.onTransport"
      @mode="player.onMode"
      @seek="player.onSeek"
    />
    <PlayerTools
      :output-label="t('on_disc')"
      :volume="connection.volume"
      :volume-disabled="player.volumeDisabled.value"
      :volume-label="t('disc_volume')"
      :volume-title="player.volumeTitle.value"
      :mute-label="t('mute')"
      :unmute-label="t('unmute')"
      :queue-label="t('open_queue')"
      :queue-expanded="ui.panel === 'queue'"
      :queue-disabled="connection.connection !== 'connected'"
      @queue="(opener) => togglePanel('queue', opener)"
      @volume="player.onVolume"
      @mute="player.onMute"
    />
  </section>
</template>
