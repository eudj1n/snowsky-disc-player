<script setup lang="ts">
/** Genres of the collection as tiles, by name in the interface language. */
import { computed } from 'vue'
import GenreGrid from '../components/genre/GenreGrid.vue'
import GenreTile from '../components/genre/GenreTile.vue'
import ViewHeading from '../components/common/ViewHeading.vue'
import { sortGenres } from '../domain/genre'
import { filterBy } from '../domain/search'
import { locale, t } from '../i18n'
import { genres } from '../stores/library'
import { ui } from '../stores/ui'
import UiSkeleton from '../ui/UiSkeleton.vue'
import { countLine, genreRoute } from './captions'
import CollectionGate from './CollectionGate.vue'
import { genreRecords } from './genreRecords'

const searching = computed(() => ui.query.trim() !== '')
const items = computed(() =>
  sortGenres(
    filterBy(genres.value, ui.query, (genre) => [genre.name]),
    locale.value,
  ),
)
</script>

<template>
  <CollectionGate :count="items.length" :searching="searching" empty-key="search_empty_genres">
    <template #heading="{ loading }">
      <ViewHeading
        :eyebrow="t('my_collection')"
        :title="t('genres')"
        :meta="loading ? null : countLine(searching, items.length)"
      />
    </template>
    <template #skeleton>
      <GenreGrid><UiSkeleton v-for="n in 8" :key="n" class="aspect-[16/10] rounded-14" /></GenreGrid>
    </template>
    <GenreGrid>
      <GenreTile
        v-for="genre in items"
        :key="genre.name"
        :name="genre.name"
        :to="genreRoute(genre.name)"
        :caption="`${t('album_count', { count: genre.albums.length })} · ${t('track_count', { count: genre.trackCount })}`"
        :records="genreRecords(genre.albums)"
      />
    </GenreGrid>
  </CollectionGate>
</template>
