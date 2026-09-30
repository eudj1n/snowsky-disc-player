<script setup lang="ts">
/**
 * Queue rows, shaped like the track rows of the collection (owner,
 * 2026-09-29): the cover (else the sleeve) is the row's button, showing play
 * on hover or focus; the playing row shows its pulsing mark there and, on
 * hover, pause or resume. Then title and artist.
 */
import { creditLabel } from '../../domain/artist'
import type { QueueItem } from '../../domain/queue'
import UiIcon from '../../ui/UiIcon.vue'
import UiNowPlaying from '../../ui/UiNowPlaying.vue'
import Artwork from '../artwork/Artwork.vue'

withDefaults(
  defineProps<{
    items: readonly QueueItem[]
    current: number | null
    selectLabel: string
    playLabel: string
    pauseLabel: string
    disabled: boolean
    playing?: boolean
  }>(),
  { playing: false },
)
const emit = defineEmits<{ select: [index: number]; toggle: [] }>()
/** Shown on row hover or keyboard focus inside the row (as TrackList). */
const REVEAL = 'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100'
</script>

<template>
  <ol class="m-0 list-none p-0">
    <li
      v-for="(item, index) in items"
      :key="index"
      class="group/row grid min-h-59 grid-cols-[40px_minmax(0,1fr)] items-center gap-13 rounded-8 border-t border-line/70 px-12 py-10 text-11 first:border-t-0"
      :class="index === current ? 'bg-selected hover:bg-selected' : 'hover:bg-soft'"
      :aria-current="index === current ? 'true' : undefined"
    >
      <button
        type="button"
        :aria-label="
          index === current ? `${playing ? pauseLabel : playLabel} ${item.title}` : `${selectLabel} ${item.title}`
        "
        :disabled="disabled"
        class="relative size-40 overflow-hidden rounded-6 p-0"
        :data-cover="item.cover ? 'true' : undefined"
        @click="index === current ? emit('toggle') : emit('select', index)"
      >
        <Artwork :title="item.title" :cover="item.cover ?? null" />
        <span
          class="absolute inset-0 grid place-items-center bg-[#0006] text-white transition-opacity duration-200"
          :class="index === current ? 'bg-[#0004] opacity-100' : REVEAL"
        >
          <template v-if="index === current">
            <UiNowPlaying :playing="playing" class="group-focus-within/row:hidden group-hover/row:hidden" />
            <UiIcon
              filled
              :name="playing ? 'pause' : 'play'"
              class="hidden size-14 group-focus-within/row:block group-hover/row:block"
              :class="{ '!stroke-[2.6]': playing }"
            />
          </template>
          <UiIcon v-else filled name="play" class="size-14" />
        </span>
      </button>
      <span class="min-w-0">
        <strong class="block truncate font-medium">{{ item.title }}</strong>
        <small class="mt-5 block truncate text-11 text-muted">{{ item.artist ? creditLabel(item.artist) : '—' }}</small>
      </span>
    </li>
  </ol>
</template>
