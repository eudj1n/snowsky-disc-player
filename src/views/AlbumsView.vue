<script setup lang="ts">
import { computed } from 'vue'
import CoverCard from '../components/collection/CoverCard.vue'
import CoverCardSkeleton from '../components/collection/CoverCardSkeleton.vue'
import CoverGrid from '../components/collection/CoverGrid.vue'
import ViewHeading from '../components/common/ViewHeading.vue'
import { ALBUM_SORTS, sortAlbums, albumScope } from '../domain/album'
import { filterBy } from '../domain/search'
import { locale, t } from '../i18n'
import { albumSort } from '../stores/preferences'
import UiChips from '../ui/UiChips.vue'
import { albumCover } from '../stores/enrichment'
import { albums } from '../stores/library'
import { ui } from '../stores/ui'
import { albumLines, albumCardRoute, countLine } from './captions'
import CollectionGate from './CollectionGate.vue'

const searching = computed(() => ui.query.trim() !== '')
const items = computed(() =>
  sortAlbums(
    filterBy(albums.value, ui.query, (album) => [album.title, ...album.artists]),
    albumSort.value,
    locale.value,
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
        :meta="loading ? null : countLine(searching, items.length)"
      >
        <UiChips v-model="albumSort" :label="t('sort_by')" :options="sorts" class="self-end" />
      </ViewHeading>
    </template>
    <template #skeleton>
      <CoverGrid><CoverCardSkeleton v-for="n in 8" :key="n" /></CoverGrid>
    </template>
    <CoverGrid>
      <CoverCard
        v-for="album in items"
        :key="album.title"
        :title="album.title"
        :to="albumCardRoute(album)"
        :cover="albumCover(album, albumScope(album))"
        :lines="albumLines(album)"
        :open-label="t('open_item', { name: album.title })"
      />
    </CoverGrid>
  </CollectionGate>
</template>
