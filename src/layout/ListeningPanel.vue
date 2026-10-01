<script setup lang="ts">
/**
 * Reference listening panel (aside#now-panel): one sheet at a time, without
 * tabs (owner, 2026-10-02). Now holds the track's head, its folded facts and
 * its lyrics on one scroll (the bar's Lyrics button opens it at the lyrics);
 * the queue is a sheet of its own (the bar's queue button, on phones a button
 * of the full-screen player, whose sheet leads back to the player); a row's
 * title shows its track (TrackPanel.vue, 2026-09-30) and an artist's or
 * album's (i) its details (InfoPanel.vue). Once the head has scrolled away, a
 * compact line of the track stays pinned (owner, 2026-09-30); it leads back to
 * the head, and on phones it keeps play and pause. The bar stays the one
 * control surface: the panel repeats no controls, except on phones, where it
 * covers the screen as a full-screen player with the bar hidden. It reserves
 * 380px from 1200px (App.vue sets .listening-open) and overlays below. Opening
 * focuses the close button; explicit closes return focus to the opener;
 * Escape closes it only when no dialog is open.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Artwork from '../components/artwork/Artwork.vue'
import NowPlayingDetails from '../components/player/NowPlayingDetails.vue'
import InfoPanel from './InfoPanel.vue'
import TrackPanel from './TrackPanel.vue'
import TrackFacts from '../components/player/TrackFacts.vue'
import { libraryRow, trackFacts } from '../domain/nowFacts'
import { trackKey } from '../domain/track'
import { device } from '../stores/device'
import LyricsView from '../components/player/LyricsView.vue'
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
import { sourceAllowed } from '../stores/externalSources'
import {
  lookUpLyrics,
  lyrics,
  lyricsLookupAvailable,
  lyricsLookupFits,
  plainLyricsOnly,
  saveFoundLyrics,
} from '../stores/lyrics'
import UiPillButton from '../ui/UiPillButton.vue'
import { playerOptions } from '../stores/playerOptions'
import { closePanel, leaveSheet, openDialog, openQueueSheet, showCover, ui } from '../stores/ui'
import { disliked, isDisliked, toggleDislike } from '../stores/disliked'
import UiIcon from '../ui/UiIcon.vue'
import UiIconButton from '../ui/UiIconButton.vue'
import { creditLabel } from '../domain/artist'
import { usePlaybackContext } from './usePlaybackContext'
import { openKaraoke } from './karaoke'
import { openVisualizer } from './visualizer'
import { usePlayerControls } from './usePlayerControls'
import { nowColourStyle } from '../stores/nowColours'

const player = usePlayerControls()
/** The playing track's cover colours; an opened track keeps the theme's. */
const route = useRoute()
/** A track's or an artist's or album's details: a sheet of its own, without the player's header and tabs (owner, 2026-10-02). */
const details = computed(() => ui.panel === 'track' || ui.panel === 'info')
const onCover = computed(() => Boolean(nowColourStyle.value) && !details.value)
const close = ref<InstanceType<typeof UiIconButton> | null>(null)
const nowScroll = ref<HTMLElement | null>(null)
const headEnd = ref<HTMLElement | null>(null)
const lyricsView = ref<InstanceType<typeof LyricsView> | null>(null)
/** The compact line's height: it covers the top of the sheet's scroll. */
const COMPACT = 60
/** The head has scrolled under the compact line, out of the Now sheet: the line shows. */
const compact = ref(false)
function onNowScroll(): void {
  const box = nowScroll.value?.getBoundingClientRect()
  const end = headEnd.value?.getBoundingClientRect()
  compact.value = Boolean(box && end && end.top <= box.top + COMPACT)
}
const smooth = () => !matchMedia('(prefers-reduced-motion: reduce)').matches
function backToHead(motion = true): void {
  nowScroll.value?.scrollTo({ top: 0, behavior: motion && smooth() ? 'smooth' : 'auto' })
}
/** The playing track's facts for the Now sheet. */
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
      ui.panel === 'queue' &&
      connection.connection === 'connected' &&
      queue.status === 'ready' &&
      queueCurrent.value === null
    )
      void loadQueue()
  },
)
// The bar's Lyrics button shows the Now sheet at the lyrics; Now, asked again while it is open, its head.
watch(
  () => ui.panelRequest,
  async () => {
    const open = Boolean(nowScroll.value)
    await nextTick()
    if (ui.panelTarget === 'lyrics') lyricsView.value?.follow(open)
    else if (ui.panelTarget === 'now' && open) backToHead()
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
  sound: t('sound_title'),
  format: t('format_from_filename'),
  resampled: t('output_resampled'),
  playingFrom: t('playing_from'),
  coverFullSize: t('cover_full_size', { name: coverName.value }),
  queue: t('open_queue'),
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
/** LRCLIB could help but is not allowed: where to allow it (2026-10-01, Settings' outside sources). */
const lookupOff = computed(() => lyricsLookupFits() && !sourceAllowed('lrclib'))
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
    leaveSheet()
}

function onNavigate(): void {
  // Below 1200px the panel covers the page: close it before navigating.
  if (matchMedia('(max-width: 1199px)').matches) closePanel(false)
}
// A details sheet belongs to the page it was opened on: below 1200px, where it covers the page, it closes when
// the page changes (Back included); the player's own panel stays.
watch(
  () => route.fullPath,
  () => {
    if (details.value) onNavigate()
  },
)

watch(
  () => ui.panel,
  async (section, previous) => {
    if (section === 'queue' && !inBrowser.value && connection.connection === 'connected') void loadQueue()
    if (!section || section === previous) return
    await nextTick()
    // Opening, or a sheet that replaced the button that led to it (the queue, back to the player): its close button.
    if (!previous || document.activeElement === document.body)
      (close.value?.$el as HTMLElement | undefined)?.focus({ preventScroll: true })
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
    :aria-label="details ? t('details_view') : ui.panel === 'queue' ? t('queue') : t('player_view')"
    class="fixed top-0 right-0 bottom-(--player) z-25 flex w-380 animate-listening-enter flex-col border-l border-line bg-raised text-left shadow-[-15px_0_65px_#26301418] phone:bottom-0 phone:z-40 phone:w-full phone:border-l-0"
    :class="{ 'on-cover': onCover }"
    :style="onCover ? nowColourStyle : undefined"
    :data-on-cover="onCover ? 'true' : undefined"
  >
    <div
      class="flex items-center justify-between px-24 pt-22 pb-12 phone:px-24 phone:pt-16 phone:pb-10"
      :class="{ 'pt-16 pb-6': ui.panel !== 'now', 'justify-end!': ui.panel !== 'now' && !ui.panelReturn }"
    >
      <span v-if="ui.panel === 'now'" class="text-caption2 font-semibold tracking-caps text-muted uppercase"
        >SNOWSKY DISC</span
      >
      <UiIconButton
        ref="close"
        :icon="ui.panelReturn ? 'back' : 'close'"
        :label="ui.panelReturn ? t('back_to_player') : ui.panel === 'now' ? t('minimize_player') : t('close')"
        data-testid="panel-close"
        @click="leaveSheet"
      />
    </div>
    <div
      v-if="ui.panel === 'now'"
      ref="nowScroll"
      class="[container-type:size] min-h-0 flex-1 [scrollbar-width:thin] overflow-auto overscroll-contain px-24 pb-28"
      @scroll.passive="onNowScroll"
    >
      <!-- Pinned above the lyrics once the head is gone; it takes no room in the flow. -->
      <div class="sticky top-0 z-3 -mx-24 h-0">
        <div
          class="flex h-60 items-center gap-12 border-b border-line bg-raised px-24 backdrop-blur-[18px] transition-[opacity,translate,visibility] duration-200 motion-reduce:transition-none"
          :class="compact ? 'visible opacity-100' : 'invisible -translate-y-4 opacity-0'"
          :inert="!compact"
          data-testid="now-compact"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-12 p-0 text-left"
            :aria-label="t('now_back_to_track')"
            @click="backToHead()"
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
        :queue-disabled="!inBrowser && connection.connection !== 'connected'"
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
        @sound="openDialog('sound')"
        @queue="openQueueSheet"
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
        <section class="mt-30" aria-labelledby="now-lyrics-title" data-testid="now-lyrics">
          <LyricsView
            ref="lyricsView"
            :lyrics="lyrics.lyrics"
            :position-ms="nowPositionMs"
            :position-at="nowPositionAt"
            :playing="nowIsPlaying"
            :message="lyricsMessage"
            :source="lyricsSource"
            :seek-label="t('lyrics_seek')"
            :seekable="!player.seekDisabled.value"
            :scroller="nowScroll"
            :covered="compact ? COMPACT : 0"
            @seek="(ms) => player.identity.value && player.onSeek(Math.floor(ms / 1000), player.identity.value)"
          >
            <div class="mb-10 flex items-center gap-10">
              <h3 id="now-lyrics-title" class="m-0 min-w-0 flex-1 text-title3 font-bold tracking-heading">
                {{ t('lyrics_heading') }}
              </h3>
              <UiIconButton
                :disabled="!nowPlaying.track"
                icon="karaoke"
                :label="t('karaoke_open')"
                data-testid="karaoke-open"
                @click="openKaraoke"
              />
            </div>
            <div v-if="lookupOffered || lyrics.source === 'lrclib'" class="mb-14" data-testid="lyrics-lookup">
              <UiPillButton
                v-if="lyrics.source === 'lrclib'"
                variant="secondary"
                :disabled="lyrics.saving"
                data-testid="lyrics-save"
                @click="saveFoundLyrics"
                >{{ t('lyrics_save') }}</UiPillButton
              >
              <template v-else>
                <p v-if="lookupMessage" class="mt-0 mb-8 text-footnote text-secondary" role="status">
                  {{ lookupMessage }}
                </p>
                <UiPillButton
                  v-if="lyrics.lookup !== 'searching'"
                  variant="secondary"
                  data-testid="lyrics-find"
                  @click="lookUpLyrics"
                  >{{ t(plainLyricsOnly() ? 'lrclib_find_synced' : 'lrclib_find') }}</UiPillButton
                >
                <p class="mt-8 mb-0 text-caption leading-[1.5] text-muted">{{ t('lrclib_note') }}</p>
              </template>
            </div>
            <p
              v-else-if="lookupOff"
              class="mt-0 mb-14 text-footnote leading-[1.5] text-secondary"
              data-testid="lyrics-source-off"
            >
              {{ t('lrclib_off') }}
              <RouterLink
                class="text-ink underline underline-offset-2"
                :to="{ path: '/settings', query: { part: 'sources' } }"
                @click="onNavigate"
                >{{ t('external_sources') }}</RouterLink
              >
            </p>
          </LyricsView>
        </section>
      </NowPlayingDetails>
    </div>
    <template v-else-if="ui.panel === 'queue'">
      <div class="shrink-0 px-24 pb-12" data-testid="panel-queue-heading">
        <div class="flex items-end justify-between">
          <div>
            <span class="text-caption2 font-semibold tracking-caps text-muted uppercase">{{
              t('your_selection')
            }}</span>
            <h2 id="panel-queue-title" class="mt-6 mb-4 text-title2 font-bold tracking-heading">
              {{ t('queue') }}
            </h2>
          </div>
          <!-- Reads the player's queue: disabled while this browser plays its own. -->
          <UiIconButton
            icon="refresh"
            :label="t('refresh_queue')"
            :disabled="inBrowser || connection.connection !== 'connected' || queue.status === 'loading'"
            @click="loadQueue"
          />
        </div>
        <p class="mt-4 mb-0 text-footnote text-muted" role="status">{{ queueHint }}</p>
      </div>
      <section
        class="min-h-0 flex-1 [scrollbar-width:thin] overflow-auto overscroll-contain px-24 pb-28"
        data-testid="panel-queue"
        aria-labelledby="panel-queue-title"
      >
        <p v-if="!inBrowser && queue.status === 'ready'" class="mt-0 mb-14 text-footnote leading-[1.55] text-muted">
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
    </template>
    <TrackPanel v-else-if="ui.panel === 'track'" @navigate="onNavigate" />
    <InfoPanel v-else-if="ui.panel === 'info'" @navigate="onNavigate" />
  </aside>
</template>
