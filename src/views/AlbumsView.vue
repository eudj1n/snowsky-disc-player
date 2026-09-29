<script setup lang="ts">
import { computed } from 'vue'
import CoverCard from '../components/collection/CoverCard.vue'
import CoverCardSkeleton from '../components/collection/CoverCardSkeleton.vue'
import CoverGrid from '../components/collection/CoverGrid.vue'
import ViewHeading from '../components/common/ViewHeading.vue'
import { ALBUM_SORTS, albumScope, albumTracks, sortAlbums, type Album } from '../domain/album'
import { findGenre, genreAlbums } from '../domain/genre'
import { filterBy } from '../domain/search'
import { locale, t } from '../i18n'
import { albumSort } from '../stores/preferences'
import UiChips from '../ui/UiChips.vue'
import { albumCover } from '../stores/enrichment'
import { albums, genres, tracks } from '../stores/library'
import { albumPinnedAt, isPinnedAlbum, pinnedFirst } from '../stores/pins'
import { ui } from '../stores/ui'
import { albumCardRoute, albumLines, countLine, genreAlbumRoute } from './captions'
import { playAlbumCard, playFrom } from './playAlbum'
import CollectionGate from './CollectionGate.vue'
import { useGenreFilter } from './genreFilter'
import GenreFilter from '../components/genre/GenreFilter.vue'
import UiTextButton from '../ui/UiTextButton.vue'

const { genre, options } = useGenreFilter()
const searching = computed(() => ui.query.trim() !== '')
const current = computed(() => (genre.value ? findGenre(genres.value, genre.value) : null))
const source = computed(() =>
  genre.value ? (current.value ? genreAlbums(albums.value, current.value) : []) : albums.value,
)
/** The album also holds tracks outside the filtered genre. */
const mixed = (album: Album) =>
  genre.value !== null &&
  albumTracks(tracks.value, album.title, albumScope(album)).some((track) => track.genre !== genre.value)
// Pinned albums lead the list (combined-008), each order kept below them.
const items = computed(() =>
  pinnedFirst(
    sortAlbums(
      filterBy(source.value, ui.query, (album) => [album.title, ...album.artists]),
      albumSort.value,
      locale.value,
    ),
    albumPinnedAt,
  ),
)
const sorts = computed(() => ALBUM_SORTS.map((value) => ({ value, text: t(`sort_${value}`) })))
</script>

<template>
  <CollectionGate :count="items.length" :searching="searching" empty-key="search_empty_albums">
    <template #heading="{ loading }">
      <ViewHeading
        :eyebrow="t('my_collection')"
        :title="t('albums')"
        :meta="loading ? null : countLine(searching || genre !== null, items.length)"
      >
        <div class="flex flex-wrap items-center gap-x-16 gap-y-10 self-end">
          <GenreFilter
            v-if="options.length"
            v-model="genre"
            :label="t('genre_filter')"
            :all-label="t('all_genres')"
            :options="options"
          />
          <span class="hidden phone:contents">
            <UiTextButton icon="arrow" @click="$router.push('/genres')">{{ t('genres') }}</UiTextButton>
          </span>
          <UiChips v-model="albumSort" :label="t('sort_by')" :options="sorts" />
        </div>
      </ViewHeading>
    </template>
    <template #skeleton>
      <CoverGrid><CoverCardSkeleton v-for="n in 8" :key="n" /></CoverGrid>
    </template>
    <CoverGrid>
      <CoverCard
        v-for="album in items"
        :key="album.key"
        :title="album.title"
        :pinned-label="isPinnedAlbum(album) ? t('pinned_mark') : null"
        :to="genre ? genreAlbumRoute(album, genre, mixed(album)) : albumCardRoute(album)"
        :cover="albumCover(album, albumScope(album))"
        :lines="albumLines(album)"
        :open-label="t('open_item', { name: album.title })"
        :play-label="t('play_item', { name: album.title })"
        @play="
          genre && mixed(album) ? playFrom({ kind: 'genreAlbum', genre, album: album.title }) : playAlbumCard(album)
        "
      />
    </CoverGrid>
  </CollectionGate>
</template>
