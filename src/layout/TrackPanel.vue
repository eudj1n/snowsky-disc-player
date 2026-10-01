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
import TrackFacts from '../components/player/TrackFacts.vue'
import ArtistCredit from '../components/track/ArtistCredit.vue'
import type { Lyrics } from '../domain/lyrics'
import { libraryRow, trackFacts } from '../domain/nowFacts'
import { sameTrack, type Track } from '../domain/track'
import { t } from '../i18n'
import { connection } from '../stores/connection'
import { disliked, isDisliked, toggleDislike } from '../stores/disliked'
import { coverFor, enrichment, wantFileFacts } from '../stores/enrichment'
import { history, loadHistory } from '../stores/history'
import { ownLyrics } from '../stores/lyrics'
import { trackByPath, tracks, library } from '../stores/library'
import { nowIsPlaying, nowPlaying } from '../stores/output'
import { openPlaylistDialog, showCover, ui } from '../stores/ui'
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
    <span class="mt-22 block text-caption2 font-semibold tracking-caps text-muted uppercase">{{
      t('kind_track')
    }}</span>
    <h2 class="mt-6 mb-4 text-title2 font-bold tracking-heading" data-testid="track-panel-title">{{ track.title }}</h2>
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
