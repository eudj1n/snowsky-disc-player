<script setup lang="ts">
/**
 * Disliked tracks (combined-008): the store's `disliked` collection, shared
 * by every browser. Each row's menu takes the dislike back.
 */
import { computed } from 'vue'
import ViewHeading from '../components/common/ViewHeading.vue'
import TrackList from '../components/track/TrackList.vue'
import { filterBy } from '../domain/search'
import { t } from '../i18n'
import { dislikedTracks } from '../stores/disliked'
import { tracks } from '../stores/library'
import { openTrackMenu, ui } from '../stores/ui'
import { countLine } from './captions'
import CollectionGate from './CollectionGate.vue'
import { onRowFavorite, onRowUnfavorite, trackRowProps } from './trackRows'

const searching = computed(() => ui.query.trim() !== '')
const items = computed(() =>
  filterBy(dislikedTracks.value, ui.query, (track) => [track.title, track.artist, track.album]),
)
const columns = computed(() => ({
  title: t('column_title'),
  album: t('column_album'),
  duration: t('column_duration'),
}))
</script>

<template>
  <!-- An empty list is not an empty collection: it gets its own hint below the heading. -->
  <CollectionGate
    :count="searching ? items.length : tracks.length"
    :searching="searching"
    empty-key="search_empty_tracks"
  >
    <template #heading="{ loading }">
      <ViewHeading
        :eyebrow="t('my_collection')"
        :title="t('disliked_section')"
        :meta="loading ? null : countLine(searching, items.length)"
      >
        <p class="m-0 max-w-420 text-footnote text-muted">{{ t('disliked_hint') }}</p>
      </ViewHeading>
    </template>
    <p v-if="!items.length" class="m-0 text-body text-muted" data-testid="disliked-empty">{{ t('disliked_empty') }}</p>
    <TrackList
      v-else
      v-bind="trackRowProps"
      :tracks="items"
      :header="columns"
      data-testid="disliked-list"
      @menu="(index, anchor) => items[index] && openTrackMenu(items[index], null, anchor)"
      @favorite="onRowFavorite"
      @unfavorite="onRowUnfavorite"
    />
  </CollectionGate>
</template>
