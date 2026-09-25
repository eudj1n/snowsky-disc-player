<script setup lang="ts">
/** Loading placeholder with the exact geometry of TrackList rows. */
import UiSkeleton from '../../ui/UiSkeleton.vue'
import TrackListHeader from './TrackListHeader.vue'
import { ROW_DIVIDER, TRACK_ROW, trackColumns, type TrackColumnLabels, type TrackLead } from './trackGrid'

withDefaults(
  defineProps<{
    rows: number
    lead?: TrackLead
    /** Text lines per row: 1 for numbered album rows by one artist. */
    lines?: 1 | 2
    album?: boolean
    duration?: boolean
    actions?: boolean
    header?: TrackColumnLabels | null
  }>(),
  { lead: 'cover', lines: 2, album: true, duration: false, actions: false, header: null },
)
// Varied bar widths read as text rather than a striped block.
const WIDTHS = ['w-[62%]', 'w-[48%]', 'w-[71%]', 'w-[55%]', 'w-[66%]', 'w-[43%]'] as const
</script>

<template>
  <div aria-hidden="true">
    <TrackListHeader
      v-if="header"
      :labels="header"
      :lead="lead"
      :album="album"
      :duration="duration"
      :actions="actions"
    />
    <div
      v-for="row in rows"
      :key="row"
      :class="[
        TRACK_ROW,
        ROW_DIVIDER,
        trackColumns(lead, album, duration, actions),
        lines === 1 ? 'min-h-46' : 'min-h-59',
      ]"
    >
      <UiSkeleton v-if="lead === 'cover'" class="mx-auto size-40 rounded-6 phone:size-34" />
      <UiSkeleton v-else class="mx-auto h-9 w-10" />
      <div class="min-w-0">
        <div class="flex h-[1lh] items-center text-11">
          <UiSkeleton class="h-[0.8em]" :class="WIDTHS[row % WIDTHS.length]" />
        </div>
        <div v-if="lines === 2" class="mt-5 flex h-[1lh] items-center text-10">
          <UiSkeleton class="h-[0.75em]" :class="WIDTHS[(row + 3) % WIDTHS.length]" />
        </div>
      </div>
      <div v-if="album" class="flex h-[1lh] items-center text-10 phone:hidden">
        <UiSkeleton class="h-[0.75em]" :class="WIDTHS[(row + 1) % WIDTHS.length]" />
      </div>
      <div v-if="duration" class="flex h-[1lh] items-center justify-end text-10">
        <UiSkeleton class="h-[0.75em] w-28" />
      </div>
      <span v-if="actions" class="flex justify-end pr-10"><UiSkeleton class="size-4 rounded-full" /></span>
    </div>
  </div>
</template>
