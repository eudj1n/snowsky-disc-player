<script setup lang="ts">
/**
 * Reference listening panel (aside#now-panel), two tabs since 2026-09-29
 * (owner): Now (the track's head, its facts and, on the same scroll, the
 * whole queue, which the bar's queue button scrolls to) and Lyrics. The bar
 * stays the one control surface: the panel repeats no controls, except on
 * phones, where it covers the screen as a full-screen player with the bar
 * hidden. It reserves 380px from 1200px (App.vue sets .listening-open) and
 * overlays below. Opening focuses the minimize button; explicit closes return
 * focus to the opener; Escape closes it only when no dialog is open.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import NowPlayingDetails from '../components/player/NowPlayingDetails.vue'
import TrackFacts from '../components/player/TrackFacts.vue'
import { libraryRow, trackFacts } from '../domain/nowFacts'
import { device } from '../stores/device'
import LyricsView from '../components/player/LyricsView.vue'
import ArtistCredit from '../components/track/ArtistCredit.vue'
import QueueRows from '../components/player/QueueRows.vue'
import { t } from '../i18n'
import { connection } from '../stores/connection'
import { selectInQueue } from '../stores/controls'
import { coverFor, enrichment, wantFileFacts } from '../stores/enrichment'
import { history, loadHistory } from '../stores/history'
import { tracks } from '../stores/library'
import { observations } from '../stores/observations'
import { isPlaying, playback } from '../stores/playback'
import { loadQueue, queue } from '../stores/queue'
import { lookUpLyrics, lyrics, lyricsLookupAvailable, saveFoundLyrics, setAutoLookup } from '../stores/lyrics'
import UiPillButton from '../ui/UiPillButton.vue'
import { playerOptions } from '../stores/playerOptions'
import { closePanel, showPanelSection, ui } from '../stores/ui'
import { disliked, isDisliked, toggleDislike } from '../stores/disliked'
import UiIconButton from '../ui/UiIconButton.vue'
import { usePlaybackContext } from './usePlaybackContext'
import { openKaraoke } from './karaoke'
import { usePlayerControls } from './usePlayerControls'

const player = usePlayerControls()
const close = ref<InstanceType<typeof UiIconButton> | null>(null)
const queueSection = ref<HTMLElement | null>(null)
/** The playing track's facts for the Now tab. */
const facts = computed(() => {
  const track = playback.current.track
  if (!track) return null
  const path = track.path
  return trackFacts({
    track,
    library: libraryRow(tracks.value, track),
    file: path ? (enrichment.files[path] ?? null) : null,
    year: path ? (enrichment.years[path] ?? null) : null,
    plays: history.plays,
  })
})
// The facts read the playing file once (size, channels, year) and the play history.
watch(
  () => [ui.panel, playback.current.track?.path] as const,
  ([panel]) => {
    if (panel !== 'now') return
    wantFileFacts(playback.current.track)
    if (connection.history && !history.loaded) void loadHistory()
  },
  { immediate: true },
)
// The bar's queue button shows the Now tab at the queue.
watch(
  () => ui.queueRequest,
  async () => {
    await nextTick()
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
    queueSection.value?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' })
  },
)
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
/** LRCLIB: offered for a track without lyrics, and what it found waits to be saved (2026-09-29). */
const lookupOffered = computed(() => lyricsLookupAvailable())
const lookupMessage = computed(() =>
  lyrics.lookup === 'searching'
    ? t('lrclib_searching')
    : lyrics.lookup === 'missing'
      ? t('lrclib_missing')
      : lyrics.lookup === 'instrumental'
        ? t('lrclib_instrumental')
        : lyrics.lookup === 'failed'
          ? t('lrclib_failed')
          : null,
)
const lyricsSource = computed(() =>
  lyrics.source === 'lrclib'
    ? t('lyrics_source_lrclib')
    : lyrics.source === 'sidecar'
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
    class="fixed top-0 right-0 bottom-(--player) z-25 flex w-380 animate-listening-enter flex-col border-l border-line bg-raised text-left shadow-[-15px_0_65px_#26301418] phone:bottom-0 phone:z-40 phone:w-full phone:border-l-0"
  >
    <div class="flex items-center justify-between px-24 pt-22 pb-12 phone:px-24 phone:pt-16 phone:pb-10">
      <span class="text-10 font-[650] tracking-[1.8px] text-muted uppercase">SNOWSKY DISC</span>
      <UiIconButton ref="close" icon="close" :label="t('minimize_player')" @click="closePanel(true)" />
    </div>
    <div class="mx-24 mb-20 flex shrink-0 gap-4 rounded-24 border border-line p-4 phone:mb-16" role="group">
      <button
        v-for="section in ['now', 'lyrics'] as const"
        :key="section"
        type="button"
        :aria-pressed="ui.panel === section"
        class="flex-1 rounded-20 px-12 py-9 text-12 text-muted aria-pressed:bg-paper aria-pressed:text-ink aria-pressed:shadow-[0_1px_5px_#0001]"
        @click="showPanelSection(section)"
      >
        {{ t(section === 'now' ? 'now_playing' : 'lyrics_tab') }}
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
        @transport="player.onTransport"
        @mode="player.onMode"
        @seek="player.onSeek"
        @favorite="player.onFavorite"
        @volume="player.onVolume"
        @mute="player.onMute"
        @navigate="onNavigate"
      >
        <TrackFacts
          v-if="facts"
          :facts="facts"
          :plays-known="connection.history"
          :disliked="
            connection.store && disliked.available && playback.current.track ? isDisliked(playback.current.track) : null
          "
          :dislike-label="t(playback.current.track && isDisliked(playback.current.track) ? 'undislike' : 'dislike')"
          @dislike="playback.current.track && toggleDislike(playback.current.track)"
          @navigate="onNavigate"
        />
        <section
          ref="queueSection"
          class="mt-30 scroll-mt-8"
          data-testid="panel-queue"
          :aria-labelledby="'panel-queue-title'"
        >
          <div class="flex items-end justify-between">
            <div>
              <span class="text-10 font-[650] tracking-[1.8px] text-muted uppercase">{{ t('your_selection') }}</span>
              <h2 id="panel-queue-title" class="mt-6 mb-4 text-24 font-bold tracking-[-0.8px]">{{ t('queue') }}</h2>
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
            :disabled="!player.ready.value || queue.status !== 'ready'"
            @select="(index) => selectInQueue(queue.items, index)"
          />
        </section>
      </NowPlayingDetails>
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
      <div v-if="lookupOffered || lyrics.source === 'lrclib'" class="shrink-0 px-24 pb-12" data-testid="lyrics-lookup">
        <UiPillButton
          v-if="lyrics.source === 'lrclib'"
          variant="secondary"
          :disabled="lyrics.saving"
          data-testid="lyrics-save"
          @click="saveFoundLyrics"
          >{{ t('lyrics_save') }}</UiPillButton
        >
        <template v-else>
          <p v-if="lookupMessage" class="mt-0 mb-8 text-11 text-secondary" role="status">{{ lookupMessage }}</p>
          <UiPillButton
            v-if="lyrics.lookup !== 'searching'"
            variant="secondary"
            data-testid="lyrics-find"
            @click="lookUpLyrics"
            >{{ t('lrclib_find') }}</UiPillButton
          >
          <p class="mt-8 mb-6 text-10 leading-[1.5] text-muted">{{ t('lrclib_note') }}</p>
          <label class="flex items-center gap-8 text-11 text-secondary">
            <input
              type="checkbox"
              :checked="lyrics.autoLookup"
              data-testid="lyrics-auto"
              @change="setAutoLookup(($event.target as HTMLInputElement).checked)"
            />
            {{ t('lrclib_auto') }}
          </label>
        </template>
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
  </aside>
</template>
