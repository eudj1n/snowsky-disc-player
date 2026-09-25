<script setup lang="ts">
import { computed } from 'vue'
import ViewHeading from '../components/common/ViewHeading.vue'
import TrackList from '../components/track/TrackList.vue'
import TrackListSkeleton from '../components/track/TrackListSkeleton.vue'
import { filterBy } from '../domain/search'
import { t } from '../i18n'
import { library } from '../stores/library'
import { playback } from '../stores/playback'
import { selection } from '../stores/selection'
import { openTrackMenu, ui } from '../stores/ui'
import { countLine } from './captions'
import CollectionGate from './CollectionGate.vue'
import { playFrom } from './playAlbum'

const searching = computed(() => ui.query.trim() !== '')
const items = computed(() => filterBy(library.tracks, ui.query, (track) => [track.title, track.artist, track.album]))
const skeletonRows = computed(() => Math.max(1, Math.min(library.summary?.tracks ?? 10, 12)))
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
      <TrackListSkeleton :rows="skeletonRows" actions />
    </template>
    <TrackList
      :tracks="items"
      :current-path="playback.current.track?.path ?? null"
      :play-label="t('play_label')"
      :disabled="selection.busy"
      :menu-label="t('track_actions')"
      @menu="
        (index, anchor) => items[index] && openTrackMenu(items[index], { kind: 'library', track: items[index] }, anchor)
      "
      @play="(index) => items[index] && playFrom({ kind: 'library', track: items[index] })"
    />
  </CollectionGate>
</template>
