<script setup lang="ts">
/** Artist detail: the albums that credit this artist. */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CoverCard from '../components/collection/CoverCard.vue'
import CoverCardSkeleton from '../components/collection/CoverCardSkeleton.vue'
import CoverGrid from '../components/collection/CoverGrid.vue'
import DetailHeading from '../components/collection/DetailHeading.vue'
import { filterBy } from '../domain/search'
import { t } from '../i18n'
import { albums, library } from '../stores/library'
import { ui } from '../stores/ui'
import UiTextButton from '../ui/UiTextButton.vue'
import { albumLines } from './captions'
import CollectionGate from './CollectionGate.vue'

const route = useRoute()
const router = useRouter()
const name = computed(() => String(route.params.name ?? ''))
const own = computed(() =>
  albums.value.filter((album) =>
    library.tracks.some(
      (track) => track.album === album.title && (track.artist === name.value || track.albumArtist === name.value),
    ),
  ),
)
const searching = computed(() => ui.query.trim() !== '')
const items = computed(() => filterBy(own.value, ui.query, (album) => [album.title, ...album.artists]))
</script>

<template>
  <CollectionGate :count="items.length" :searching="searching" empty-key="search_empty_albums">
    <template #heading="{ loading }">
      <UiTextButton class="text-12" @click="router.push('/artists')">← {{ t('back_to_collection') }}</UiTextButton>
      <DetailHeading :eyebrow="t('artist')" :title="name" artist>
        <template #meta>
          <span v-if="loading" class="inline-block h-10 w-90 animate-pulse rounded-4 bg-soft align-middle" />
          <template v-else>{{ t('album_count', { count: own.length }) }}</template>
        </template>
      </DetailHeading>
    </template>
    <template #skeleton>
      <CoverGrid><CoverCardSkeleton v-for="n in 4" :key="n" /></CoverGrid>
    </template>
    <CoverGrid>
      <CoverCard
        v-for="album in items"
        :key="album.title"
        :title="album.title"
        :lines="albumLines(album)"
        :open-label="t('open_item', { name: album.title })"
        @open="router.push({ name: 'album', params: { name: album.title } })"
      />
    </CoverGrid>
  </CollectionGate>
</template>
