<script setup lang="ts">
/**
 * Reference listening panel (aside#now-panel), two tabs since 2026-09-29
 * (owner): Now (the track's head, its facts and, on the same scroll, the
 * whole queue, which the bar's queue button scrolls to) and Lyrics. Once the
 * head has scrolled away, a compact line of the track and the queue's heading
 * stay pinned and only the list moves (owner, 2026-09-30); the line leads back
 * to the head, and on phones it keeps play and pause. The bar
 * stays the one control surface: the panel repeats no controls, except on
 * phones, where it covers the screen as a full-screen player with the bar
 * hidden. It reserves 380px from 1200px (App.vue sets .listening-open) and
 * overlays below. Opening focuses the minimize button; explicit closes return
 * focus to the opener; Escape closes it only when no dialog is open.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Artwork from '../components/artwork/Artwork.vue'
import NowPlayingDetails from '../components/player/NowPlayingDetails.vue'
import TrackFacts from '../components/player/TrackFacts.vue'
import { libraryRow, trackFacts } from '../domain/nowFacts'
import { trackKey } from '../domain/track'
import { device } from '../stores/device'
import LyricsView from '../components/player/LyricsView.vue'
import ArtistCredit from '../components/track/ArtistCredit.vue'
import QueueRows from '../components/player/QueueRows.vue'
import { t } from '../i18n'
import { connection } from '../stores/connection'
import { selectInQueue } from '../stores/controls'
import { coverFor, enrichment, wantFileFacts } from '../stores/enrichment'
import { history, loadHistory } from '../stores/history'
import { trackByPath, tracks } from '../stores/library'
import { browserPlayback, selectInBrowser } from '../stores/browser'
import { switchSide } from '../stores/handoff'
import { inBrowser, nowIsPlaying, nowPlaying, nowPositionAt, nowPositionMs, output } from '../stores/output'
import { loadQueue, queue, queueCurrent } from '../stores/queue'
import {
  lookUpLyrics,
  lyrics,
  lyricsLookupAvailable,
  plainLyricsOnly,
  saveFoundLyrics,
  setAutoLookup,
} from '../stores/lyrics'
import UiPillButton from '../ui/UiPillButton.vue'
import { playerOptions } from '../stores/playerOptions'
import { closePanel, showCover, showPanelSection, ui } from '../stores/ui'
import { disliked, isDisliked, toggleDislike } from '../stores/disliked'
import UiIcon from '../ui/UiIcon.vue'
import UiIconButton from '../ui/UiIconButton.vue'
import { creditLabel } from '../domain/artist'
import { usePlaybackContext } from './usePlaybackContext'
import { openKaraoke } from './karaoke'
import { openVisualizer } from './visualizer'
import { usePlayerControls } from './usePlayerControls'

const player = usePlayerControls()
const close = ref<InstanceType<typeof UiIconButton> | null>(null)
const queueSection = ref<HTMLElement | null>(null)
const nowScroll = ref<HTMLElement | null>(null)
const headEnd = ref<HTMLElement | null>(null)
/** The head has scrolled out of the Now tab: the compact line of the track shows. */
const compact = ref(false)
function onNowScroll(): void {
  const box = nowScroll.value?.getBoundingClientRect()
  const end = headEnd.value?.getBoundingClientRect()
  compact.value = Boolean(box && end && end.top <= box.top)
}
function backToHead(): void {
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
  nowScroll.value?.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' })
}
/** The playing track's facts for the Now tab. */
const facts = computed(() => {
  const track = nowPlaying.value.track
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
  () => [ui.panel, nowPlaying.value.track?.path] as const,
  ([panel]) => {
    if (panel !== 'now') return
    wantFileFacts(nowPlaying.value.track)
    if (connection.history && !history.loaded) void loadHistory()
  },
  { immediate: true },
)
// A track the shown queue does not hold (another source started, here or on the player) reads it again.
watch(
  () => (nowPlaying.value.track ? trackKey(nowPlaying.value.track) : null),
  (key) => {
    if (
      key &&
      !inBrowser.value &&
      ui.panel &&
      connection.connection === 'connected' &&
      queue.status === 'ready' &&
      queueCurrent.value === null
    )
      void loadQueue()
  },
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
/** The queue the panel lists: this browser's own while it plays here, else the player's snapshot. */
const items = computed(() =>
  inBrowser.value
    ? browserPlayback.queue.map((row) => {
        const known = row.path ? trackByPath.value.get(row.path) : undefined
        return { title: row.cueTitle ?? row.title, artist: row.artist, cover: known ? coverFor(known) : null }
      })
    : queue.items.map((row, index) => {
        const detail = queue.details[index]
        // Stock names a row of an M3U list by its file, without an artist: the library names it (2026-09-30).
        const unnamed = !row.author && detail
        return {
          title: unnamed ? detail.title : row.name,
          artist: unnamed ? detail.artist : row.author,
          cover: detail ? coverFor(detail) : null,
        }
      }),
)
const listCurrent = computed(() => (inBrowser.value ? browserPlayback.index : queueCurrent.value))
function selectRow(index: number): void {
  if (inBrowser.value) selectInBrowser(index)
  else void selectInQueue(queue.items, index)
}
const status = computed(() =>
  inBrowser.value || connection.connection === 'connected'
    ? t(`playback_${nowPlaying.value.state}`)
    : t('disconnected'),
)
const context = usePlaybackContext()
const labels = computed(() => ({
  title: t('your_music_awaits'),
  shuffle: t('shuffle'),
  previous: t('previous_track'),
  play: t('play'),
  pause: t('pause'),
  next: t('next_track'),
  repeat: t(player.repeatOne.value ? 'repeat_one' : 'repeat_queue'),
  favorite: t('favorite_track'),
  seek: t('seek_position'),
  volume: t('player_volume'),
  volumeTitle: player.volumeTitle.value,
  mute: t('mute'),
  unmute: t('unmute'),
  output: t(inBrowser.value ? 'audio_plays_in_this_browser' : 'audio_plays_on_your_disc'),
  switchSide: t(inBrowser.value ? 'side_browser' : 'side_disc'),
  visualizer: t('visualizer_open'),
  format: t('format_from_filename'),
  resampled: t('output_resampled'),
  playingFrom: t('playing_from'),
  coverFullSize: t('cover_full_size', { name: coverName.value }),
}))
const nowCover = computed(() => (nowPlaying.value.track ? coverFor(nowPlaying.value.track) : null))
/** What the full-size cover is named by: the album, else the track. */
const coverName = computed(() => nowPlaying.value.track?.album || nowPlaying.value.track?.title || '')
function showNowCover(): void {
  if (nowCover.value) showCover(nowCover.value, coverName.value)
}
const lyricsMessage = computed(() => {
  if (!nowPlaying.value.track) return t('lyrics_idle')
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
      : lyrics.lookup === 'missing-synced'
        ? t('lrclib_missing_synced')
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
  if (inBrowser.value) return t('track_count', { count: browserPlayback.queue.length })
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
      if (!inBrowser.value && connection.connection === 'connected') void loadQueue()
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
      <span class="text-caption2 font-semibold tracking-caps text-muted uppercase">SNOWSKY DISC</span>
      <UiIconButton ref="close" icon="close" :label="t('minimize_player')" @click="closePanel(true)" />
    </div>
    <div class="mx-24 mb-20 flex shrink-0 gap-4 rounded-24 border border-line p-4 phone:mb-16" role="group">
      <button
        v-for="section in ['now', 'lyrics'] as const"
        :key="section"
        type="button"
        :aria-pressed="ui.panel === section"
        class="flex-1 rounded-20 px-12 py-9 text-footnote text-muted aria-pressed:bg-paper aria-pressed:text-ink aria-pressed:shadow-[0_1px_5px_#0001]"
        @click="showPanelSection(section)"
      >
        {{ t(section === 'now' ? 'now_playing' : 'lyrics_tab') }}
      </button>
    </div>
    <div
      v-if="ui.panel === 'now'"
      ref="nowScroll"
      class="min-h-0 flex-1 [scrollbar-width:thin] overflow-auto overscroll-contain px-24 pb-28"
      @scroll.passive="onNowScroll"
    >
      <!-- Pinned above the list once the head is gone; it takes no room in the flow. -->
      <div class="sticky top-0 z-3 -mx-24 h-0">
        <div
          class="flex h-60 items-center gap-12 border-b border-line bg-raised px-24 transition-[opacity,translate,visibility] duration-200 motion-reduce:transition-none"
          :class="compact ? 'visible opacity-100' : 'invisible -translate-y-4 opacity-0'"
          :inert="!compact"
          data-testid="now-compact"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-12 p-0 text-left"
            :aria-label="t('now_back_to_track')"
            @click="backToHead"
          >
            <span class="block size-40 shrink-0 overflow-hidden rounded-6 bg-soft">
              <Artwork :title="nowPlaying.track?.title ?? null" :cover="nowCover" />
            </span>
            <span class="min-w-0">
              <strong class="block truncate text-body font-semibold">{{
                nowPlaying.track?.title ?? t('your_music_awaits')
              }}</strong>
              <span v-if="nowPlaying.track?.artist" class="block truncate text-footnote text-muted">{{
                creditLabel(nowPlaying.track.artist)
              }}</span>
            </span>
          </button>
          <!-- Phones hide the bar while the panel is open: play and pause stay at hand. -->
          <button
            type="button"
            class="hidden size-36 shrink-0 place-items-center rounded-full bg-strong text-strong-ink phone:grid"
            :aria-label="nowPlaying.state === 'playing' ? t('pause') : t('play')"
            :disabled="player.controlsDisabled.value"
            @click="player.onTransport('toggle')"
          >
            <UiIcon filled :name="nowPlaying.state === 'playing' ? 'pause' : 'play'" class="size-15" />
          </button>
        </div>
      </div>
      <NowPlayingDetails
        :playback="nowPlaying"
        :side="inBrowser ? 'browser' : 'disc'"
        :switching="output.switching"
        :output="device.facts?.output ?? null"
        :cover="nowCover"
        :status="status"
        :position-ms="nowPositionMs"
        :identity="player.identity.value"
        :seek-feedback="player.seekFeedback.value"
        :controls-disabled="player.controlsDisabled.value"
        :modes-disabled="player.modesDisabled.value"
        :seek-disabled="player.seekDisabled.value"
        :favorite-disabled="player.favoriteDisabled.value"
        :shuffle="player.shuffle.value"
        :repeat="player.repeat.value"
        :repeat-one="player.repeatOne.value"
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
        @side="switchSide"
        @visualizer="openVisualizer"
        @cover="showNowCover"
      >
        <div ref="headEnd" aria-hidden="true" />
        <TrackFacts
          v-if="facts"
          :facts="facts"
          :plays-known="connection.history"
          :disliked="connection.store && disliked.available && nowPlaying.track ? isDisliked(nowPlaying.track) : null"
          :dislike-label="t(nowPlaying.track && isDisliked(nowPlaying.track) ? 'undislike' : 'dislike')"
          @dislike="nowPlaying.track && toggleDislike(nowPlaying.track)"
          @navigate="onNavigate"
        />
        <section
          ref="queueSection"
          class="mt-30 scroll-mt-68"
          data-testid="panel-queue"
          :aria-labelledby="'panel-queue-title'"
        >
          <!-- The queue's heading stays on top of its list, below the compact line of the track. -->
          <div
            class="sticky z-2 -mx-24 bg-raised px-24 pb-6 transition-[top] duration-200 motion-reduce:transition-none"
            :class="compact ? 'top-60 pt-10' : 'top-0 pt-2'"
            data-testid="panel-queue-heading"
          >
            <div class="flex items-end justify-between">
              <div>
                <span class="text-caption2 font-semibold tracking-caps text-muted uppercase">{{
                  t('your_selection')
                }}</span>
                <h2 id="panel-queue-title" class="mt-6 mb-4 text-title2 font-bold tracking-heading">
                  {{ t('queue') }}
                </h2>
              </div>
              <UiIconButton
                v-if="!inBrowser"
                icon="refresh"
                :label="t('refresh_queue')"
                :disabled="connection.connection !== 'connected' || queue.status === 'loading'"
                @click="loadQueue"
              />
            </div>
            <p class="mt-4 mb-0 text-footnote text-muted" role="status">{{ queueHint }}</p>
          </div>
          <p v-if="!inBrowser && queue.status === 'ready'" class="mt-4 mb-14 text-footnote leading-[1.55] text-muted">
            {{ t('queue_snapshot_note') }}
          </p>
          <QueueRows
            :items="items"
            :current="listCurrent"
            :playing="nowIsPlaying"
            :select-label="t('select_in_queue')"
            :play-label="t('play')"
            :pause-label="t('pause')"
            :disabled="!player.ready.value || (!inBrowser && queue.status !== 'ready')"
            @select="selectRow"
            @toggle="player.onTransport('toggle')"
          />
        </section>
      </NowPlayingDetails>
    </div>
    <template v-else-if="ui.panel === 'lyrics'">
      <!-- The tab already says Lyrics: the header names the track only (owner, round 14). -->
      <div class="shrink-0 px-24 pb-10">
        <div class="flex items-center gap-10">
          <h2 class="mt-0 mb-0 min-w-0 flex-1 truncate text-title2 font-bold tracking-heading">
            {{ nowPlaying.track?.title ?? t('lyrics_tab') }}
          </h2>
          <UiIconButton
            v-if="nowPlaying.track"
            icon="karaoke"
            :label="t('karaoke_open')"
            data-testid="karaoke-open"
            @click="openKaraoke"
          />
        </div>
        <p
          v-if="nowPlaying.track?.artist"
          class="mt-2 mb-0 truncate text-footnote text-muted"
          @click="($event.target as HTMLElement).closest('a') && onNavigate()"
        >
          <ArtistCredit
            :credit="nowPlaying.track.artist"
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
          <p v-if="lookupMessage" class="mt-0 mb-8 text-footnote text-secondary" role="status">{{ lookupMessage }}</p>
          <UiPillButton
            v-if="lyrics.lookup !== 'searching'"
            variant="secondary"
            data-testid="lyrics-find"
            @click="lookUpLyrics"
            >{{ t(plainLyricsOnly() ? 'lrclib_find_synced' : 'lrclib_find') }}</UiPillButton
          >
          <p class="mt-8 mb-6 text-caption leading-[1.5] text-muted">{{ t('lrclib_note') }}</p>
          <label class="flex items-center gap-8 text-footnote text-secondary">
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
        :position-ms="nowPositionMs"
        :position-at="nowPositionAt"
        :playing="nowIsPlaying"
        :message="lyricsMessage"
        :source="lyricsSource"
        :seek-label="t('lyrics_seek')"
        :seekable="!player.seekDisabled.value"
        @seek="(ms) => player.identity.value && player.onSeek(Math.floor(ms / 1000), player.identity.value)"
      />
    </template>
  </aside>
</template>
