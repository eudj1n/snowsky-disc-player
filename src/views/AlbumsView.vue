<script setup lang="ts">
import { computed } from 'vue'
import CoverCard from '../components/collection/CoverCard.vue'
import CoverCardSkeleton from '../components/collection/CoverCardSkeleton.vue'
import CoverGrid from '../components/collection/CoverGrid.vue'
import ViewHeading from '../components/common/ViewHeading.vue'
import { filterBy } from '../domain/search'
import { t } from '../i18n'
import { albums } from '../stores/library'
import { ui } from '../stores/ui'
import { albumLines, albumRoute, countLine } from './captions'
import CollectionGate from './CollectionGate.vue'

const searching = computed(() => ui.query.trim() !== '')
const items = computed(() => filterBy(albums.value, ui.query, (album) => [album.title, ...album.artists]))
</script>

<template>
  <CollectionGate :count="items.length" :searching="searching" empty-key="search_empty_albums">
    <template #heading="{ loading }">
      <ViewHeading
        :eyebrow="t('my_collection')"
        :title="t('albums')"
        :meta="loading ? null : countLine(searching, items.length)"
      />
    </template>
    <template #skeleton>
      <CoverGrid><CoverCardSkeleton v-for="n in 8" :key="n" /></CoverGrid>
    </template>
    <CoverGrid>
      <CoverCard
        v-for="album in items"
        :key="album.title"
        :title="album.title"
        :to="albumRoute(album.title)"
        :lines="albumLines(album)"
        :open-label="t('open_item', { name: album.title })"
      />
    </CoverGrid>
  </CollectionGate>
</template>
