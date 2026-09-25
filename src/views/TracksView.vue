<script setup lang="ts">
import { computed } from 'vue'
import ViewHeading from '../components/common/ViewHeading.vue'
import TrackList from '../components/track/TrackList.vue'
import TrackListSkeleton from '../components/track/TrackListSkeleton.vue'
import { filterBy } from '../domain/search'
import { t } from '../i18n'
import { tracks, library } from '../stores/library'
import { openTrackMenu, ui } from '../stores/ui'
import { countLine } from './captions'
import CollectionGate from './CollectionGate.vue'
import { onRowFavorite, trackRowProps } from './trackRows'
import { playFrom } from './playAlbum'

const searching = computed(() => ui.query.trim() !== '')
const items = computed(() => filterBy(tracks.value, ui.query, (track) => [track.title, track.artist, track.album]))
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
        :meta="loading ? null : countLine(searching, items.length)"
      />
    </template>
    <template #skeleton>
      <TrackListSkeleton :rows="skeletonRows" actions :header="columns" />
    </template>
    <TrackList
      v-bind="trackRowProps"
      :tracks="items"
      :header="columns"
      @menu="
        (index, anchor) => items[index] && openTrackMenu(items[index], { kind: 'library', track: items[index] }, anchor)
      "
      @play="(index) => items[index] && playFrom({ kind: 'library', track: items[index] })"
      @favorite="onRowFavorite"
    />
  </CollectionGate>
</template>
