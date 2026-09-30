<script setup lang="ts">
/**
 * The player's favorites. Stock keeps a favorite in MY_LOVE after its file
 * is deleted and the card rescanned; like Apple Music and Yandex Music the
 * row stays in place, dimmed and not playable, since the file may come back
 * (owner, 2026-09-28). Its heart still removes it.
 */
import { computed } from 'vue'
import ViewHeading from '../components/common/ViewHeading.vue'
import TrackList from '../components/track/TrackList.vue'
import TrackListSkeleton from '../components/track/TrackListSkeleton.vue'
import { t } from '../i18n'
import { disliked } from '../stores/disliked'
import { favorites, library, trackByPath } from '../stores/library'
import { openTrackMenu } from '../stores/ui'
import { countLine } from './captions'
import CollectionGate from './CollectionGate.vue'
import { onRowFavorite, onRowUnfavorite, trackRowProps } from './trackRows'
import { playFrom } from './playAlbum'

const items = computed(() => favorites.value)
/** Not on the card: the library, read with the favorites, has no such file. */
const unavailable = (track: { path: string | null }) =>
  library.status === 'ready' && (track.path === null || !trackByPath.value.has(track.path))
const skeletonRows = computed(() => Math.max(1, Math.min(library.summary?.favorites ?? 6, 12)))
const columns = computed(() => ({
  title: t('column_title'),
  album: t('column_album'),
  duration: t('column_duration'),
}))
</script>

<template>
  <CollectionGate :count="items.length">
    <template #heading="{ loading }">
      <ViewHeading
        :eyebrow="t('my_collection')"
        :title="t('favorites')"
        :meta="loading ? null : countLine(false, items.length)"
      >
        <RouterLink
          v-if="disliked.available"
          to="/disliked"
          data-testid="disliked-link"
          class="rounded-20 bg-soft px-14 py-7 text-footnote font-medium text-muted hover:bg-hover hover:text-ink"
          >{{ t('disliked_section') }} · {{ disliked.records.length }}</RouterLink
        >
      </ViewHeading>
    </template>
    <template #skeleton>
      <TrackListSkeleton :rows="skeletonRows" actions :header="columns" />
    </template>
    <TrackList
      v-bind="trackRowProps"
      :tracks="items"
      :header="columns"
      :unavailable-of="unavailable"
      :unavailable-label="t('track_unavailable')"
      @menu="
        (index, anchor) =>
          items[index] && openTrackMenu(items[index], { kind: 'favorites', track: items[index] }, anchor)
      "
      @play="(index) => items[index] && playFrom({ kind: 'favorites', track: items[index] })"
      @favorite="onRowFavorite"
      @unfavorite="onRowUnfavorite"
    />
  </CollectionGate>
</template>
