<script setup lang="ts">
/** Loading placeholder with the exact geometry of TrackList rows. */
import UiSkeleton from '../../ui/UiSkeleton.vue'
import { TRACK_ROW, trackColumns } from './trackGrid'

withDefaults(defineProps<{ rows: number; header?: boolean; album?: boolean; duration?: boolean }>(), {
  header: false,
  album: true,
  duration: false,
})
// Varied bar widths read as text rather than a striped block.
const WIDTHS = ['w-[62%]', 'w-[48%]', 'w-[71%]', 'w-[55%]', 'w-[66%]', 'w-[43%]'] as const
</script>

<template>
  <div aria-hidden="true">
    <div
      v-if="header"
      class="mb-5 min-h-30 rounded-none border-b border-line"
      :class="[TRACK_ROW, trackColumns(album, duration)]"
    >
      <UiSkeleton class="mx-auto h-8 w-8" />
      <span />
      <UiSkeleton class="h-8 w-48" />
      <UiSkeleton v-if="album" class="h-8 w-40 phone:hidden" />
      <UiSkeleton v-if="duration" class="ml-auto h-8 w-14" />
    </div>
    <div v-for="row in rows" :key="row" class="min-h-59" :class="[TRACK_ROW, trackColumns(album, duration)]">
      <UiSkeleton class="mx-auto h-9 w-10" />
      <UiSkeleton class="size-38 rounded-6 phone:size-34" />
      <div class="min-w-0">
        <div class="flex h-[1lh] items-center text-11">
          <UiSkeleton class="h-[0.8em]" :class="WIDTHS[row % WIDTHS.length]" />
        </div>
        <div class="mt-5 flex h-[1lh] items-center text-10">
          <UiSkeleton class="h-[0.75em]" :class="WIDTHS[(row + 3) % WIDTHS.length]" />
        </div>
      </div>
      <div v-if="album" class="flex h-[1lh] items-center text-10 phone:hidden">
        <UiSkeleton class="h-[0.75em]" :class="WIDTHS[(row + 1) % WIDTHS.length]" />
      </div>
      <div v-if="duration" class="flex h-[1lh] items-center justify-end text-10">
        <UiSkeleton class="h-[0.75em] w-28" />
      </div>
    </div>
  </div>
</template>
