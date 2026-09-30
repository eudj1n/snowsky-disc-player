<script setup lang="ts">
import { computed } from 'vue'
import CoverCard from '../components/collection/CoverCard.vue'
import CoverCardSkeleton from '../components/collection/CoverCardSkeleton.vue'
import CoverGrid from '../components/collection/CoverGrid.vue'
import ViewHeading from '../components/common/ViewHeading.vue'
import { t } from '../i18n'
import { artistImage } from '../stores/artistPictures'
import { artists } from '../stores/library'
import { artistPinnedAt, isPinnedArtist, pinnedFirst } from '../stores/pins'

import { artistRoute, countLine } from './captions'
import { playFrom } from './playAlbum'
import CollectionGate from './CollectionGate.vue'

// Pinned artists lead the list (combined-008).
const items = computed(() => pinnedFirst(artists.value, (artist) => artistPinnedAt(artist.name)))
</script>

<template>
  <CollectionGate :count="items.length">
    <template #heading="{ loading }">
      <ViewHeading
        :eyebrow="t('my_collection')"
        :title="t('artists')"
        :meta="loading ? null : countLine(false, items.length)"
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
