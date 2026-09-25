<script setup lang="ts">
/**
 * Reference bottom player: current track, transport and timeline, output
 * and volume. Transport works once the session is connected, compatible and
 * paired; other controls wait for their milestone and stay disabled.
 */
import { computed } from 'vue'
import NowPlayingSummary from '../components/player/NowPlayingSummary.vue'
import PlayerTools from '../components/player/PlayerTools.vue'
import PlayerTransport from '../components/player/PlayerTransport.vue'
import type { TransportAction } from '../domain/playback'
import { t } from '../i18n'
import { connection } from '../stores/connection'
import { pairing } from '../stores/pairing'
import { playback, transport } from '../stores/playback'
import { selection } from '../stores/selection'
import { toast, togglePanel, ui } from '../stores/ui'

const track = computed(() => playback.current.track)
const title = computed(() => track.value?.title ?? t('your_music_awaits'))
const subtitle = computed(
  () => track.value?.artist ?? t(connection.connection === 'connected' ? 'choose_an_album' : 'connect_your_disc'),
)
const labels = computed(() => ({
  shuffle: t('shuffle'),
  previous: t('previous_track'),
  play: t('play'),
  pause: t('pause'),
  next: t('next_track'),
  repeat: t('repeat_queue'),
  seek: t('seek_position'),
}))
const volume = computed(() => connection.volume)
// Reference rule: transport needs a ready player, no request in flight and a
// current track. Unpaired clicks explain pairing instead of doing nothing.
const controlsDisabled = computed(
  () =>
    connection.connection !== 'connected' ||
    connection.identity?.compatible !== true ||
    playback.busy ||
    selection.busy ||
    !track.value,
)

async function onTransport(action: TransportAction): Promise<void> {
  if (!pairing.paired) {
    toast('pair_to_control')
    return
  }
  if (playback.busy) {
    toast('please_wait_for_the_current_request')
    return
  }
  await transport(action)
  if (playback.uncertain) toast('result_unconfirmed_the_command_was_not_retried', true)
}
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
      :favorite-label="t('favorite_the_current_track')"
      :favorite="playback.current.favorite"
      favorite-disabled
      @open="(opener) => togglePanel('now', opener)"
    />
    <PlayerTransport
      :state="playback.current.state"
      :duration-ms="track?.durationMs ?? null"
      :controls-disabled="controlsDisabled"
      mode-disabled
      :labels="labels"
      @transport="onTransport"
    />
    <PlayerTools
      :output-label="t('on_disc')"
      :volume="volume"
      :volume-label="t('disc_volume')"
      :volume-title="volume === null ? t('volume_unknown') : t('volume_value', { value: volume })"
      :queue-label="t('open_queue')"
      :queue-expanded="ui.panel === 'queue'"
      :queue-disabled="connection.connection !== 'connected'"
      @queue="(opener) => togglePanel('queue', opener)"
    />
  </section>
</template>
