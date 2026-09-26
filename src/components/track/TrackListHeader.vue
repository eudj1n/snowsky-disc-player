<script setup lang="ts">
/**
 * Muted column header for long track lists (Tracks, Favorites): names the
 * title (from the cover column) and album columns and marks duration with
 * a clock. Shares the row
 * grid, so it lines up with rows and their skeletons.
 */
import UiIcon from '../../ui/UiIcon.vue'
import { HEART_LANE, TRACK_HEADER, trackColumns, type TrackColumnLabels, type TrackLead } from './trackGrid'

defineProps<{
  labels: TrackColumnLabels
  lead: TrackLead
  album: boolean
  duration: boolean
  actions: boolean
  /** Rows keep a heart lane on phones: the header follows. */
  heartLane?: boolean
}>()
</script>

<template>
  <div role="row" :class="[TRACK_HEADER, trackColumns(lead, album, duration, actions), { [HEART_LANE]: heartLane }]">
    <!-- The title starts at the cover; on numbered lists after the number. -->
    <span v-if="lead === 'number'" role="columnheader" class="text-center">#</span>
    <span role="columnheader" :class="{ 'col-span-2': lead === 'cover' }">{{ labels.title }}</span>
    <span v-if="album" role="columnheader" class="phone:hidden">{{ labels.album }}</span>
    <span v-if="duration" role="columnheader" class="flex justify-end" :title="labels.duration">
      <UiIcon name="clock" class="size-12" /><span class="sr-only">{{ labels.duration }}</span>
    </span>
    <span v-if="actions" role="columnheader" />
  </div>
</template>
