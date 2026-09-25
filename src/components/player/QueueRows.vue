<script setup lang="ts">
/** Queue rows (reference rows(queueItems, true)): number, sleeve, title, artist. */
import type { QueueItem } from '../../domain/queue'
import UiIcon from '../../ui/UiIcon.vue'
import ArtworkSleeve from '../artwork/ArtworkSleeve.vue'

defineProps<{ items: readonly QueueItem[]; current: number | null }>()
</script>

<template>
  <ol class="m-0 list-none p-0">
    <li
      v-for="(item, index) in items"
      :key="index"
      class="grid min-h-54 grid-cols-[24px_36px_minmax(0,1fr)] items-center gap-12 rounded-8 px-8 py-8 text-11"
      :class="index === current ? 'bg-selected' : 'hover:bg-soft'"
      :aria-current="index === current ? 'true' : undefined"
    >
      <span class="flex justify-center text-10 text-muted">
        <UiIcon v-if="index === current" name="music" class="size-15 text-secondary" />
        <template v-else>{{ index + 1 }}</template>
      </span>
      <span class="size-36 overflow-hidden rounded-6"><ArtworkSleeve :title="item.title" /></span>
      <span class="min-w-0">
        <strong class="block truncate font-[550]">{{ item.title }}</strong>
        <small class="mt-4 block truncate text-10 text-muted">{{ item.artist || '—' }}</small>
      </span>
    </li>
  </ol>
</template>
