<script setup lang="ts">
import { computed } from 'vue'
import ViewHeading from '../components/common/ViewHeading.vue'
import GenreFilter from '../components/genre/GenreFilter.vue'
import TrackList from '../components/track/TrackList.vue'
import TrackListSkeleton from '../components/track/TrackListSkeleton.vue'
import { genreTracks } from '../domain/genre'
import { filterBy } from '../domain/search'
import type { SelectionTarget, TrackKey } from '../gateway/selection'
import { t } from '../i18n'
import { tracks, library } from '../stores/library'
import { openTrackMenu, ui } from '../stores/ui'
import { countLine } from './captions'
import CollectionGate from './CollectionGate.vue'
import { useGenreFilter } from './genreFilter'
import { onRowFavorite, onRowUnfavorite, trackRowProps } from './trackRows'
import { playFrom } from './playAlbum'

const { genre, options } = useGenreFilter()
const searching = computed(() => ui.query.trim() !== '')
const source = computed(() => (genre.value ? genreTracks(tracks.value, genre.value) : tracks.value))
const items = computed(() => filterBy(source.value, ui.query, (track) => [track.title, track.artist, track.album]))
/** With a genre filter, playback stays in that stock genre (reference). */
const target = (track: TrackKey): SelectionTarget =>
  genre.value ? { kind: 'genre', genre: genre.value, track } : { kind: 'library', track }
const skeletonRows = computed(() => Math.max(1, Math.min(library.summary?.tracks ?? 10, 12)))
const columns = computed(() => ({
  title: t('column_title'),
  album: t('column_album'),
  duration: t('column_duration'),
}))
</script>

<template>
  <CollectionGate :count="items.length" :searching="searching" empty-key="search_empty_tracks">
    <template #heading="{ loading }">
      <ViewHeading
        :eyebrow="t('my_collection')"
        :title="t('tracks')"
        :meta="loading ? null : countLine(searching || genre !== null, items.length)"
      >
        <GenreFilter
          v-if="options.length"
          v-model="genre"
          :label="t('genre_filter')"
          :all-label="t('all_genres')"
          :options="options"
          class="self-end"
        />
      </ViewHeading>
    </template>
    <template #skeleton>
      <TrackListSkeleton :rows="skeletonRows" actions :header="columns" />
    </template>
    <TrackList
      v-bind="trackRowProps"
      :tracks="items"
      :header="columns"
      @menu="(index, anchor) => items[index] && openTrackMenu(items[index], target(items[index]), anchor)"
      @play="(index) => items[index] && playFrom(target(items[index]))"
      @favorite="onRowFavorite"
      @unfavorite="onRowUnfavorite"
    />
  </CollectionGate>
</template>
