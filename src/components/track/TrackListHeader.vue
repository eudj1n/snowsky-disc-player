<script setup lang="ts">
/**
 * Muted column header for long track lists (Tracks, Favorites): names the
 * title and album columns and marks duration with a clock. Shares the row
 * grid, so it lines up with rows and their skeletons.
 */
import UiIcon from '../../ui/UiIcon.vue'
import { TRACK_HEADER, trackColumns, type TrackColumnLabels } from './trackGrid'

defineProps<{ labels: TrackColumnLabels; album: boolean; duration: boolean; actions: boolean }>()
</script>

<template>
  <div role="row" :class="[TRACK_HEADER, trackColumns(album, duration, actions)]">
    <span role="columnheader" />
    <span role="columnheader" class="col-span-2">{{ labels.title }}</span>
    <span v-if="album" role="columnheader" class="phone:hidden">{{ labels.album }}</span>
    <span v-if="duration" role="columnheader" class="flex justify-end" :title="labels.duration">
      <UiIcon name="clock" class="size-12" /><span class="sr-only">{{ labels.duration }}</span>
    </span>
    <span v-if="actions" role="columnheader" />
  </div>
</template>
