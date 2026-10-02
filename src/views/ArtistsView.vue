<script setup lang="ts">
/**
 * The collection's artists. By default only those with records of their own
 * (owner, 2026-10-02): an artist known only from another's joint credits shows
 * under All. The genre filter keeps the artists a genre page lists (anyone
 * credited on its tracks, joint credits included). Both live in the hash query
 * (`?all=1`, `?genre=`), as on Albums and Tracks; pinned artists lead the list.
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CoverCard from '../components/collection/CoverCard.vue'
import CoverCardSkeleton from '../components/collection/CoverCardSkeleton.vue'
import CoverGrid from '../components/collection/CoverGrid.vue'
import ViewHeading from '../components/common/ViewHeading.vue'
import GenreFilter from '../components/genre/GenreFilter.vue'
import { genreArtists } from '../domain/genre'
import { t } from '../i18n'
import { artistImage } from '../stores/artistPictures'
import { artists, tracks } from '../stores/library'
import { artistPinnedAt, isPinnedArtist, pinnedFirst } from '../stores/pins'
import UiChips from '../ui/UiChips.vue'

import { artistRoute, countLine } from './captions'
import { playFrom } from './playAlbum'
import CollectionGate from './CollectionGate.vue'
import { useGenreFilter } from './genreFilter'

const route = useRoute()
const router = useRouter()
const { genre, options } = useGenreFilter()
type Shown = 'own' | 'all'
const shown = computed<Shown>({
  get: () => (route.query.all === '1' ? 'all' : 'own'),
  set: (value) => void router.replace({ query: { ...route.query, all: value === 'all' ? '1' : undefined } }),
})
const shownOptions = computed(() => [
  { value: 'own' as const, text: t('artists_own') },
  { value: 'all' as const, text: t('artists_all') },
])
const inGenre = computed(() =>
  genre.value ? new Set(genreArtists(tracks.value, genre.value).map((artist) => artist.name)) : null,
)
// A pinned artist stays in view whichever artists are shown.
const items = computed(() =>
  pinnedFirst(
    artists.value.filter(
      (artist) =>
        (shown.value === 'all' || artist.own || isPinnedArtist(artist.name)) &&
        (!inGenre.value || inGenre.value.has(artist.name)),
    ),
    (artist) => artistPinnedAt(artist.name),
  ),
)
</script>

<template>
  <CollectionGate :count="items.length">
    <template #heading="{ loading }">
      <ViewHeading
        :eyebrow="t('my_collection')"
        :title="t('artists')"
        :meta="loading ? null : countLine(genre !== null, items.length)"
      >
        <div class="flex flex-wrap items-center gap-x-16 gap-y-10 self-end">
          <GenreFilter
            v-if="options.length"
            v-model="genre"
            :label="t('genre_filter')"
            :all-label="t('all_genres')"
            :options="options"
          />
          <UiChips v-model="shown" :label="t('artists_shown')" :options="shownOptions" />
        </div>
      </ViewHeading>
    </template>
    <template #skeleton>
      <CoverGrid><CoverCardSkeleton v-for="n in 8" :key="n" artist :lines="0" /></CoverGrid>
    </template>
    <CoverGrid>
      <CoverCard
        v-for="artist in items"
        :key="artist.name"
        :title="artist.name"
        :to="artistRoute(artist.name)"
        artist
        :cover="artistImage(artist.name)"
        :pinned-label="isPinnedArtist(artist.name) ? t('pinned_mark') : null"
        :open-label="t('open_item', { name: artist.name })"
        :play-label="artist.literal ? t('play_item', { name: artist.name }) : null"
        @play="playFrom({ kind: 'artist', artist: artist.name })"
      />
    </CoverGrid>
  </CollectionGate>
</template>
