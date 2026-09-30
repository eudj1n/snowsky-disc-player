<script setup lang="ts">
import { computed, onMounted } from 'vue'
import ViewHeading from '../components/common/ViewHeading.vue'
import GenreFilter from '../components/genre/GenreFilter.vue'
import TrackList from '../components/track/TrackList.vue'
import TrackListSkeleton from '../components/track/TrackListSkeleton.vue'
import { genreTracks, sameGenre } from '../domain/genre'
import { sortTracks, TRACK_SORTS } from '../domain/history'
import type { SelectionTarget, TrackKey } from '../gateway/selection'
import { t } from '../i18n'
import { history, loadHistory, sourceOf } from '../stores/history'
import { tracks, library } from '../stores/library'
import { trackSort } from '../stores/preferences'
import UiChips from '../ui/UiChips.vue'
import { openTrackMenu, openTrackPanel } from '../stores/ui'
import { countLine } from './captions'
import CollectionGate from './CollectionGate.vue'
import { useGenreFilter } from './genreFilter'
import { sourceNote } from './sourceTiles'
import { onRowFavorite, onRowUnfavorite, trackRowProps } from './trackRows'
import { playFrom } from './playAlbum'

const { genre, options } = useGenreFilter()
const source = computed(() => (genre.value ? genreTracks(tracks.value, genre.value) : tracks.value))
const sorted = computed(() => sortTracks(source.value, trackSort.value, history.most))
const items = computed(() => sorted.value)
/** "Most played" only with recorded plays; "Recently played" with the service's history (next image). */
const sorts = computed(() =>
  TRACK_SORTS.filter(
    (value) => (value !== 'played' || history.most.length > 0) && (value !== 'recent' || history.plays.length > 0),
  ).map((value) => ({
    value,
    text: t(`track_sort_${value}`),
  })),
)
/** The last play of each path, for the source note of the history order. */
const lastPlay = computed(() => new Map(history.plays.map((play) => [play.path, play])))
const sourceNoteOf = (track: { path: string | null }) => {
  const play = track.path ? lastPlay.value.get(track.path) : undefined
  return play ? sourceNote(sourceOf(play)) : null
}
onMounted(() => void loadHistory())
/** With a genre filter, playback stays in that stock genre (reference). */
const target = (track: TrackKey & { genre?: string | null }): SelectionTarget =>
  genre.value
    ? {
        kind: 'genre',
        // Stock plays one spelling of a genre: the track's own.
        genre: track.genre && sameGenre(track.genre, genre.value) ? track.genre : genre.value,
        track: { title: track.title, artist: track.artist },
      }
    : { kind: 'library', track: { title: track.title, artist: track.artist } }
const skeletonRows = computed(() => Math.max(1, Math.min(library.summary?.tracks ?? 10, 12)))
const columns = computed(() => ({
  title: t('column_title'),
  album: t('column_album'),
  duration: t('column_duration'),
}))
</script>

<template>
  <CollectionGate :count="items.length">
    <template #heading="{ loading }">
      <ViewHeading
        :eyebrow="t('my_collection')"
        :title="t('tracks')"
        :meta="loading ? null : countLine(genre !== null, items.length)"
      >
        <div class="flex flex-wrap items-center gap-12 self-end">
          <GenreFilter
            v-if="options.length"
            v-model="genre"
            :label="t('genre_filter')"
            :all-label="t('all_genres')"
            :options="options"
          />
          <UiChips v-model="trackSort" :label="t('sort_tracks')" :options="sorts" />
        </div>
      </ViewHeading>
    </template>
    <template #skeleton>
      <TrackListSkeleton :rows="skeletonRows" actions :header="columns" />
    </template>
    <TrackList
      v-bind="trackRowProps"
      :tracks="items"
      :header="columns"
      :album-note="trackSort === 'recent' ? sourceNoteOf : null"
      @menu="(index, anchor) => items[index] && openTrackMenu(items[index], target(items[index]), anchor)"
      @open="(index, anchor) => items[index] && openTrackPanel(items[index], target(items[index]), anchor)"
      @play="(index) => items[index] && playFrom(target(items[index]))"
      @favorite="onRowFavorite"
      @unfavorite="onRowUnfavorite"
    />
  </CollectionGate>
</template>
