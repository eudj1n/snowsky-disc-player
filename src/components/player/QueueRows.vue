<script setup lang="ts">
/** Queue rows (reference rows(queueItems, true)): select button, sleeve, title, artist. */
import { creditLabel } from '../../domain/artist'
import type { QueueItem } from '../../domain/queue'
import UiIcon from '../../ui/UiIcon.vue'
import UiNowPlaying from '../../ui/UiNowPlaying.vue'
import ArtworkSleeve from '../artwork/ArtworkSleeve.vue'

withDefaults(
  defineProps<{
    items: readonly QueueItem[]
    current: number | null
    selectLabel: string
    disabled: boolean
    playing?: boolean
  }>(),
  { playing: false },
)
const emit = defineEmits<{ select: [index: number] }>()
</script>

<template>
  <ol class="m-0 list-none p-0">
    <li
      v-for="(item, index) in items"
      :key="index"
      class="grid min-h-54 grid-cols-[24px_36px_minmax(0,1fr)] items-center gap-12 rounded-8 border-t border-line/70 px-8 py-8 text-11 first:border-t-0"
      :class="index === current ? 'bg-selected' : 'hover:bg-soft'"
      :aria-current="index === current ? 'true' : undefined"
    >
      <span class="flex justify-center text-11 text-muted">
        <UiNowPlaying v-if="index === current" :playing="playing" class="text-progress-fill" />
        <button
          v-else
          type="button"
          :aria-label="`${selectLabel} ${item.title}`"
          :disabled="disabled"
          class="grid size-24 place-items-center p-0 text-secondary hover:enabled:text-ink"
          @click="emit('select', index)"
        >
          <UiIcon name="play" class="size-15" />
        </button>
      </span>
      <span class="size-36 overflow-hidden rounded-6"><ArtworkSleeve :title="item.title" /></span>
      <span class="min-w-0">
        <strong class="block truncate font-[550]">{{ item.title }}</strong>
        <small class="mt-4 block truncate text-11 text-muted">{{ item.artist ? creditLabel(item.artist) : '—' }}</small>
      </span>
    </li>
  </ol>
</template>
