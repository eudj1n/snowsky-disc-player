<script setup lang="ts">
/**
 * Reference listening panel (aside#now-panel): non-modal, Now Playing and
 * Queue under one header, each section scrolling on its own. It reserves
 * 380px from 1200px (App.vue sets .listening-open), overlays below and fills
 * the width on phones. Opening focuses the minimize button; explicit closes
 * return focus to the opener; Escape closes it only when no dialog is open.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import NowPlayingDetails from '../components/player/NowPlayingDetails.vue'
import { device } from '../stores/device'
import LyricsView from '../components/player/LyricsView.vue'
import ArtistCredit from '../components/track/ArtistCredit.vue'
import QueueRows from '../components/player/QueueRows.vue'
import { t } from '../i18n'
import { connection } from '../stores/connection'
import { selectInQueue } from '../stores/controls'
import { coverFor } from '../stores/enrichment'
import { observations } from '../stores/observations'
import { operation } from '../stores/operation'
import { isPlaying, playback } from '../stores/playback'
import { loadQueue, queue } from '../stores/queue'
import { lyrics } from '../stores/lyrics'
import { playerOptions } from '../stores/playerOptions'
import { closePanel, showPanelSection, ui } from '../stores/ui'
import { disliked, isDisliked, toggleDislike } from '../stores/disliked'
import UiIconButton from '../ui/UiIconButton.vue'
import { usePlaybackContext } from './usePlaybackContext'
import { openKaraoke } from './karaoke'
import { usePlayerControls } from './usePlayerControls'

const player = usePlayerControls()
const close = ref<InstanceType<typeof UiIconButton> | null>(null)
const items = computed(() =>
  queue.items.map((row, index) => {
    const detail = queue.details[index]
    return { title: row.name, artist: row.author, cover: detail ? coverFor(detail) : null }
  }),
)
const status = computed(() =>
  connection.connection === 'connected' ? t(`playback_${playback.current.state}`) : t('disconnected'),
)
const context = usePlaybackContext()
const labels = computed(() => ({
  title: t('your_music_awaits'),
  shuffle: t('shuffle'),
  previous: t('previous_track'),
  play: t('play'),
  pause: t('pause'),
  next: t('next_track'),
  repeat: t('repeat_queue'),
  favorite: t('favorite_track'),
  seek: t('seek_position'),
  volume: t('player_volume'),
  volumeTitle: player.volumeTitle.value,
  mute: t('mute'),
  unmute: t('unmute'),
  output: t('audio_plays_on_your_disc'),
  format: t('format_from_filename'),
  resampled: t('output_resampled'),
  playingFrom: t('playing_from'),
}))
const lyricsMessage = computed(() => {
  if (!playback.current.track) return t('lyrics_idle')
  if (lyrics.status === 'loading') return t('lyrics_loading')
  if (lyrics.status === 'unavailable') return t('lyrics_unavailable')
  return t('lyrics_none')
})
const lyricsSource = computed(() =>
  lyrics.source === 'sidecar'
    ? t('lyrics_source_sidecar')
    : lyrics.source === 'embedded'
      ? t('lyrics_source_embedded')
      : lyrics.source === 'player'
        ? t(playerOptions.onlineLyrics ? 'lyrics_source_player_online' : 'lyrics_source_player')
        : null,
)
const queueHint = computed(() => {
  if (connection.connection !== 'connected') return t('connect_your_disc')
  if (queue.status === 'loading') return t('reading_the_queue')
  if (queue.status === 'failed') return t('queue_unavailable')
  if (queue.status === 'ready' && !queue.items.length) return t('choose_an_album_to_get_started')
  if (queue.status === 'ready') return t('track_count', { count: queue.items.length })
  return ''
})

function onKeydown(event: KeyboardEvent): void {
  // Karaoke over the panel takes its own Escape.
  if (
    event.key === 'Escape' &&
    ui.panel &&
    !ui.karaoke &&
    !event.defaultPrevented &&
    !document.querySelector('dialog[open]')
  )
    closePanel(true)
}

function onNavigate(): void {
  // Below 1200px the panel covers the page: close it before navigating.
  if (matchMedia('(max-width: 1199px)').matches) closePanel(false)
}

watch(
  () => ui.panel,
  async (section, previous) => {
    if (section && !previous) {
      if (connection.connection === 'connected') void loadQueue()
      await nextTick()
      ;(close.value?.$el as HTMLElement | undefined)?.focus({ preventScroll: true })
    }
  },
)
watch(
  () => connection.connection,
  (state) => state === 'disconnected' && ui.panel && closePanel(false),
)
onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <aside
    v-if="ui.panel"
    id="now-panel"
    :aria-label="t('player_view')"
    class="fixed top-0 right-0 bottom-(--player) z-25 flex w-380 animate-listening-enter flex-col border-l border-line bg-raised text-left shadow-[-15px_0_65px_#26301418] phone:w-full phone:border-l-0"
  >
    <div class="flex items-center justify-between px-24 pt-22 pb-12 phone:px-24 phone:pt-16 phone:pb-10">
      <span class="text-10 font-[650] tracking-[1.8px] text-muted uppercase">SNOWSKY DISC</span>
      <UiIconButton ref="close" icon="close" :label="t('minimize_player')" @click="closePanel(true)" />
    </div>
    <div class="mx-24 mb-20 flex shrink-0 gap-4 rounded-24 border border-line p-4 phone:mb-16" role="group">
      <button
        v-for="section in ['now', 'lyrics', 'queue'] as const"
        :key="section"
        type="button"
        :aria-pressed="ui.panel === section"
        class="flex-1 rounded-20 px-12 py-9 text-12 text-muted aria-pressed:bg-paper aria-pressed:text-ink aria-pressed:shadow-[0_1px_5px_#0001]"
        @click="showPanelSection(section)"
      >
        {{ t(section === 'now' ? 'now_playing' : section === 'lyrics' ? 'lyrics_tab' : 'queue') }}
      </button>
    </div>
    <div
      v-if="ui.panel === 'now'"
      class="min-h-0 flex-1 [scrollbar-width:thin] overflow-auto overscroll-contain px-24 pb-28"
    >
      <NowPlayingDetails
        :playback="playback.current"
        :output="device.facts?.output ?? null"
        :cover="playback.current.track ? coverFor(playback.current.track) : null"
        :status="status"
        :position-ms="observations.positionMs"
        :identity="player.identity.value"
        :seek-feedback="player.seekFeedback.value"
        :controls-disabled="player.controlsDisabled.value"
        :modes-disabled="player.modesDisabled.value"
        :seek-disabled="player.seekDisabled.value"
        :favorite-disabled="player.favoriteDisabled.value"
        :shuffle="player.shuffle.value"
        :repeat="player.repeat.value"
        :volume="connection.volume"
        :volume-disabled="player.volumeDisabled.value"
        :labels="labels"
        :context="context"
        :disliked="
          connection.store && disliked.available && playback.current.track ? isDisliked(playback.current.track) : null
        "
        :dislike-label="t(playback.current.track && isDisliked(playback.current.track) ? 'undislike' : 'dislike')"
        @dislike="playback.current.track && toggleDislike(playback.current.track)"
        @transport="player.onTransport"
        @mode="player.onMode"
        @seek="player.onSeek"
        @favorite="player.onFavorite"
        @volume="player.onVolume"
        @mute="player.onMute"
        @navigate="onNavigate"
      />
    </div>
    <template v-else-if="ui.panel === 'lyrics'">
      <!-- The tab already says Lyrics: the header names the track only (owner, round 14). -->
      <div class="shrink-0 px-24 pb-10">
        <div class="flex items-center gap-10">
          <h2 class="mt-0 mb-0 min-w-0 flex-1 truncate text-24 font-bold tracking-[-0.8px]">
            {{ playback.current.track?.title ?? t('lyrics_tab') }}
          </h2>
          <UiIconButton
            v-if="playback.current.track"
            icon="karaoke"
            :label="t('karaoke_open')"
            data-testid="karaoke-open"
            @click="openKaraoke"
          />
        </div>
        <p
          v-if="playback.current.track?.artist"
          class="mt-2 mb-0 truncate text-11 text-muted"
          @click="($event.target as HTMLElement).closest('a') && onNavigate()"
        >
          <ArtistCredit
            :credit="playback.current.track.artist"
            :to="(name) => ({ name: 'artist', params: { name } })"
            link-class="hover:text-ink hover:underline"
          />
        </p>
      </div>
      <LyricsView
        :lyrics="lyrics.lyrics"
        :position-ms="observations.positionMs"
        :position-at="observations.positionAt"
        :playing="isPlaying"
        :message="lyricsMessage"
        :source="lyricsSource"
        :seek-label="t('lyrics_seek')"
        :seekable="!player.seekDisabled.value"
        @seek="(ms) => player.identity.value && player.onSeek(Math.floor(ms / 1000), player.identity.value)"
      />
    </template>
    <div v-else class="min-h-0 flex-1 [scrollbar-width:thin] overflow-auto overscroll-contain px-24 pb-28">
      <div class="flex items-end justify-between">
        <div>
          <span class="text-10 font-[650] tracking-[1.8px] text-muted uppercase">{{ t('your_selection') }}</span>
          <h2 class="mt-6 mb-4 text-24 font-bold tracking-[-0.8px]">{{ t('queue') }}</h2>
        </div>
        <UiIconButton
          icon="refresh"
          :label="t('refresh_queue')"
          :disabled="connection.connection !== 'connected' || queue.status === 'loading'"
          @click="loadQueue"
        />
      </div>
      <p class="mt-4 mb-4 text-11 text-muted" role="status">{{ queueHint }}</p>
      <p v-if="queue.status === 'ready'" class="mt-0 mb-14 text-11 leading-[1.6] text-muted">
        {{ t('queue_snapshot_note') }}
      </p>
      <QueueRows
        :items="items"
        :current="queue.current"
        :playing="isPlaying"
        :select-label="t('select_in_queue')"
        :disabled="!player.ready.value || operation.busy || queue.status !== 'ready'"
        @select="(index) => selectInQueue(queue.items, index)"
      />
    </div>
  </aside>
</template>
