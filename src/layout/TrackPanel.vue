<script setup lang="ts">
/**
 * A track in the listening panel (owner, 2026-09-30): a click on a row's title
 * opens it, playing or not. Its head (cover, title, artist and album links),
 * Play on the side the bar's switch chooses (pause and resume for the current
 * track), the favorite heart and Add to playlist, drawn and disabled where
 * they cannot act; then the facts the playing track gets (quality, year,
 * genre, disc, size, folder, plays, dislike) and its own lyrics, read once
 * when it opens.
 */
import { computed, ref, watch } from 'vue'
import Artwork from '../components/artwork/Artwork.vue'
import SectionHeading from '../components/common/SectionHeading.vue'
import TrackFacts from '../components/player/TrackFacts.vue'
import ArtistCredit from '../components/track/ArtistCredit.vue'
import type { Lyrics } from '../domain/lyrics'
import { libraryRow, trackFacts } from '../domain/nowFacts'
import { sameTrack, type LibraryTrack, type Track } from '../domain/track'
import { t } from '../i18n'
import { playInBrowser } from '../stores/browser'
import { connection } from '../stores/connection'
import { disliked, isDisliked, toggleDislike } from '../stores/disliked'
import { recommendOutside } from '../stores/externalSources'
import { coverFor, enrichment, wantFileFacts } from '../stores/enrichment'
import { history, loadHistory } from '../stores/history'
import { ownLyrics } from '../stores/lyrics'
import { trackByPath, tracks, library } from '../stores/library'
import { inBrowser, nowIsPlaying, nowPlaying } from '../stores/output'
import {
  canAskSimilar,
  lookUpSimilarTracks,
  recommendationsAllowed,
  recommendationsAutomatic,
  trackSimilar,
} from '../stores/recommendations'
import { openPlaylistDialog, openTrackPanel, showCover, ui } from '../stores/ui'
import UiCircleButton from '../ui/UiCircleButton.vue'
import UiPillButton from '../ui/UiPillButton.vue'
import { artistRoute, trackAlbumRoute } from '../views/captions'
import { playFrom } from '../views/playAlbum'
import { onRowFavorite, onRowLove, onRowUnfavorite, toggleCurrent, trackRowProps } from '../views/trackRows'

const emit = defineEmits<{ navigate: [] }>()

const track = computed<Track | null>(() => ui.panelTrack?.track ?? null)
const cover = computed(() => (track.value ? coverFor(track.value) : null))
const current = computed(() =>
  Boolean(track.value && nowPlaying.value.track && sameTrack(track.value, nowPlaying.value.track)),
)
/** The file is on the card (a favorite or playlist entry may outlive it). */
const onCard = computed(() => {
  const path = track.value?.path
  return library.status !== 'ready' || (path != null && trackByPath.value.has(path))
})
const facts = computed(() => {
  const shown = track.value
  if (!shown) return null
  const path = shown.path
  return trackFacts({
    track: shown,
    library: libraryRow(tracks.value, shown),
    file: path ? (enrichment.files[path] ?? null) : null,
    year: path ? (enrichment.years[path] ?? null) : null,
    plays: history.plays,
  })
})

const playLabel = computed(() => t(current.value && nowIsPlaying.value ? 'pause' : 'play_label'))
const playDisabled = computed(() => !current.value && (!ui.panelTrack?.play || !onCard.value))
function play(): void {
  if (current.value) toggleCurrent()
  else if (ui.panelTrack?.play) void playFrom(ui.panelTrack.play)
}

/** The heart acts as a row's does: the current track, a favorite to remove, a track to add. */
const favorite = computed(() => (track.value ? isFavoriteOf(track.value) : null))
const isFavoriteOf = (shown: Track) => trackRowProps.value.favoriteOf(shown)
const heart = computed<(() => void) | null>(() => {
  const shown = track.value
  const row = trackRowProps.value
  if (!shown || favorite.value === null) return null
  if (current.value) return row.favoriteDisabled ? null : onRowFavorite
  if (favorite.value) return row.favoriteRemovable ? () => onRowUnfavorite(shown) : null
  return row.favoriteAddable && onCard.value ? () => onRowLove(shown) : null
})
const heartLabel = computed(() => {
  const labels = trackRowProps.value.favoriteLabels
  if (favorite.value) return heart.value ? labels.removeAny : labels.favorite
  return heart.value ? labels.addAny : labels.onlyCurrent
})
function addToPlaylist(): void {
  if (track.value) openPlaylistDialog({ mode: 'add', tracks: [{ ...track.value }], title: track.value.title })
}

type LyricsState = { status: 'loading' | 'none' | 'unavailable' } | { status: 'ready'; lyrics: Lyrics; source: string }
const lyrics = ref<LyricsState>({ status: 'loading' })
let request = 0
// Read once per opened track: its file's facts, the play history and its own lyrics.
watch(
  track,
  async (shown) => {
    const asked = ++request
    lyrics.value = { status: 'loading' }
    if (!shown) return
    wantFileFacts(shown)
    if (connection.history && !history.loaded) void loadHistory()
    const found = await ownLyrics(shown)
    if (asked !== request) return
    lyrics.value =
      found === 'unavailable'
        ? { status: 'unavailable' }
        : found
          ? {
              status: 'ready',
              lyrics: found.lyrics,
              source: t(found.source === 'embedded' ? 'lyrics_source_embedded' : 'lyrics_source_sidecar'),
            }
          : { status: 'none' }
  },
  { immediate: true },
)
const lyricsMessage = computed(() =>
  lyrics.value.status === 'loading'
    ? t('lyrics_loading')
    : lyrics.value.status === 'unavailable'
      ? t('lyrics_unavailable')
      : t('lyrics_none'),
)
const LINK = 'hover:text-ink hover:underline hover:underline-offset-3'

/*
 * Similar tracks, by ListenBrainz (owner, 2026-10-23, stage 3): the recordings its listeners play with this
 * one, laid against the card. Asked by itself when the source works automatically, else on a click; only for
 * a track whose album is identified (its recording comes from the edition). "Not on the card" counts only
 * when the owner lets the sources suggest what the card lacks.
 */
const libraryTrack = computed<LibraryTrack | null>(() => {
  const path = track.value?.path
  return path ? (trackByPath.value.get(path) ?? null) : null
})
const similar = computed(() => (libraryTrack.value ? trackSimilar(libraryTrack.value) : null))
const similarShown = computed(() => recommendationsAllowed() && libraryTrack.value !== null)
const similarAskable = computed(() => libraryTrack.value !== null && canAskSimilar(libraryTrack.value))
function askSimilar(): void {
  if (libraryTrack.value) void lookUpSimilarTracks(libraryTrack.value)
}
watch(
  () =>
    similarShown.value && similarAskable.value && recommendationsAutomatic() && !similar.value
      ? track.value?.path
      : null,
  (path) => {
    if (path) askSimilar()
  },
  { immediate: true },
)
const similarTracks = computed(() => similar.value?.onCard.map((item) => item.track) ?? [])
function openSimilar(item: LibraryTrack, event: MouseEvent): void {
  openTrackPanel(
    item,
    { kind: 'library', track: { title: item.title, artist: item.artist } },
    event.currentTarget as HTMLElement,
  )
}
function playSimilarHere(): void {
  if (similarTracks.value.length) playInBrowser(similarTracks.value)
}
function addSimilarToPlaylist(): void {
  if (similarTracks.value.length)
    openPlaylistDialog({
      mode: 'add',
      tracks: similarTracks.value.map((item) => ({ ...item })),
      title: t('similar_tracks'),
    })
}
</script>

<template>
  <div
    v-if="track"
    class="min-h-0 flex-1 [scrollbar-width:thin] overflow-auto overscroll-contain px-24 pb-28"
    data-testid="track-panel"
  >
    <button
      type="button"
      class="mx-auto block aspect-square w-full overflow-hidden rounded-14 bg-soft p-0 text-ink shadow-[0_12px_28px_#07100820] disabled:cursor-default phone:w-[min(100%,30dvh)]"
      :aria-label="t('cover_full_size', { name: track.album || track.title })"
      :disabled="!cover"
      @click="cover && showCover(cover, track.album || track.title)"
    >
      <Artwork :title="track.title" :cover="cover" />
    </button>
    <h2 class="mt-22 mb-4 text-title2 font-bold tracking-heading" data-testid="track-panel-title">{{ track.title }}</h2>
    <p class="m-0 text-footnote text-muted" @click="($event.target as HTMLElement).closest('a') && emit('navigate')">
      <ArtistCredit v-if="track.artist" :credit="track.artist" :to="artistRoute" :link-class="LINK" />
      <template v-if="track.album && trackAlbumRoute(track)">
        <span v-if="track.artist" aria-hidden="true"> · </span>
        <RouterLink :to="trackAlbumRoute(track) ?? ''" :class="LINK">{{ track.album }}</RouterLink>
      </template>
    </p>
    <div class="mt-18 flex items-center gap-10">
      <UiPillButton
        :icon="current && nowIsPlaying ? 'pause' : 'play'"
        :disabled="playDisabled"
        data-testid="track-panel-play"
        @click="play"
        >{{ playLabel }}</UiPillButton
      >
      <UiCircleButton
        icon="heart"
        fill
        :label="heartLabel"
        :pressed="favorite === true"
        :disabled="!heart"
        data-testid="track-panel-heart"
        @click="heart?.()"
      />
      <UiCircleButton
        icon="playlist"
        :label="t('add_to_playlist')"
        :disabled="!onCard || !track.path"
        data-testid="track-panel-add"
        @click="addToPlaylist"
      />
    </div>
    <TrackFacts
      v-if="facts"
      class="mt-24"
      :facts="facts"
      :plays-known="connection.history"
      :disliked="connection.store && disliked.available && track.path ? isDisliked(track) : null"
      :dislike-label="t(isDisliked(track) ? 'undislike' : 'dislike')"
      @dislike="track && toggleDislike(track)"
      @navigate="emit('navigate')"
    />
    <section v-if="similarShown" class="mt-30" :aria-label="t('similar_tracks')" data-testid="track-panel-similar">
      <SectionHeading
        :title="t('similar_tracks')"
        :hint="t('similar_tracks_by')"
        class="mt-0! mb-10 [&_h2]:text-title3"
      />
      <p v-if="!similarAskable" class="m-0 text-footnote leading-[1.55] text-muted">
        {{ t('similar_tracks_identify') }}
      </p>
      <p v-else-if="!similar" class="m-0">
        <UiPillButton variant="secondary" data-testid="track-panel-similar-ask" @click="askSimilar">{{
          t('recommend_ask')
        }}</UiPillButton>
      </p>
      <p v-else-if="similar.status === 'loading'" role="status" class="m-0 text-footnote text-muted">
        {{ t('recommend_asking') }}
      </p>
      <p v-else-if="similar.status === 'unidentified'" class="m-0 text-footnote leading-[1.55] text-muted">
        {{ t('similar_tracks_identify') }}
      </p>
      <p
        v-else-if="similar.status === 'failed'"
        class="m-0 flex flex-wrap items-center gap-12 text-footnote text-muted"
      >
        {{ t('recommend_failed') }}
        <UiPillButton variant="secondary" data-testid="track-panel-similar-retry" @click="askSimilar">{{
          t('identify_retry')
        }}</UiPillButton>
      </p>
      <template v-else>
        <ul v-if="similar.onCard.length" class="m-0 grid list-none gap-2 p-0" data-testid="track-panel-similar-list">
          <li v-for="item in similar.onCard" :key="item.track.path ?? item.track.title">
            <button
              type="button"
              class="w-full rounded-8 px-8 py-6 text-left text-footnote hover:bg-hover"
              @click="openSimilar(item.track, $event)"
            >
              <span class="text-ink">{{ item.track.title }}</span>
              <span v-if="item.track.artist" class="text-muted"> · {{ item.track.artist }}</span>
            </button>
          </li>
        </ul>
        <p v-else class="m-0 text-footnote leading-[1.55] text-muted">{{ t('similar_tracks_none') }}</p>
        <p
          v-if="recommendOutside() && similar.absent > 0"
          class="mt-8 mb-0 text-footnote text-muted"
          data-testid="track-panel-similar-absent"
        >
          {{ t('similar_tracks_absent', { count: similar.absent }) }}
        </p>
        <div v-if="similar.onCard.length" class="mt-12 flex flex-wrap gap-8">
          <UiPillButton
            v-if="inBrowser"
            variant="secondary"
            icon="play"
            data-testid="track-panel-similar-play"
            @click="playSimilarHere"
            >{{ t('similar_play_here') }}</UiPillButton
          >
          <UiPillButton
            variant="secondary"
            icon="playlist"
            :disabled="!onCard"
            data-testid="track-panel-similar-add"
            @click="addSimilarToPlaylist"
            >{{ t('add_to_playlist') }}</UiPillButton
          >
        </div>
      </template>
    </section>
    <section class="mt-30" aria-labelledby="track-panel-lyrics" data-testid="track-panel-lyrics">
      <h3 id="track-panel-lyrics" class="mt-0 mb-10 text-title3 font-bold tracking-heading">
        {{ t('lyrics_heading') }}
      </h3>
      <div v-if="lyrics.status === 'ready'" class="text-body leading-[1.55] whitespace-pre-line text-secondary">
        <p v-for="(line, index) in lyrics.lyrics.lines" :key="index" class="m-0 min-h-[1lh]">{{ line.text }}</p>
        <p class="mt-20 mb-0 text-footnote text-muted">{{ lyrics.source }}</p>
      </div>
      <p v-else class="m-0 text-footnote leading-[1.55] text-muted" role="status">{{ lyricsMessage }}</p>
    </section>
  </div>
</template>
