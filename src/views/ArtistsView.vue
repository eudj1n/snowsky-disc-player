<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import CoverCard from '../components/collection/CoverCard.vue'
import CoverCardSkeleton from '../components/collection/CoverCardSkeleton.vue'
import CoverGrid from '../components/collection/CoverGrid.vue'
import ViewHeading from '../components/common/ViewHeading.vue'
import { filterBy } from '../domain/search'
import { t } from '../i18n'
import { artists } from '../stores/library'
import { ui } from '../stores/ui'
import { countLine } from './captions'
import CollectionGate from './CollectionGate.vue'

const router = useRouter()
const searching = computed(() => ui.query.trim() !== '')
const items = computed(() => filterBy(artists.value, ui.query, (artist) => [artist.name]))
</script>

<template>
  <CollectionGate :count="items.length" :searching="searching" empty-key="search_empty_artists">
    <template #heading="{ loading }">
      <ViewHeading
        :eyebrow="t('my_collection')"
        :title="t('artists')"
        :meta="loading ? null : countLine(searching, items.length)"
      />
    </template>
    <template #skeleton>
      <CoverGrid><CoverCardSkeleton v-for="n in 8" :key="n" artist :lines="0" /></CoverGrid>
    </template>
    <CoverGrid>
      <CoverCard
        v-for="artist in items"
        :key="artist.name"
        :title="artist.name"
        artist
        :open-label="t('open_item', { name: artist.name })"
        @open="router.push({ name: 'artist', params: { name: artist.name } })"
      />
    </CoverGrid>
  </CollectionGate>
</template>
