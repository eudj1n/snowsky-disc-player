<script setup lang="ts">
/**
 * Compact track grid for discovery sections: cover with a play overlay,
 * title, artist and the ⋯ actions, in three columns on desktop, two on
 * tablets and one on phones, separated by quiet dividers.
 */
import type { Track } from '../../domain/track'
import UiIcon from '../../ui/UiIcon.vue'
import Artwork from '../artwork/Artwork.vue'

withDefaults(
  defineProps<{
    tracks: readonly Track[]
    playLabel: string
    menuLabel: string
    coverOf?: (track: Track) => Blob | null
    currentPath?: string | null
    disabled?: boolean
  }>(),
  { coverOf: () => null, currentPath: null, disabled: false },
)
const emit = defineEmits<{ play: [index: number]; menu: [index: number, anchor: HTMLElement] }>()
</script>

<template>
  <ul
    class="m-0 grid list-none grid-flow-row grid-cols-3 gap-x-28 p-0 compact:gap-x-20 rail:grid-cols-2 phone:grid-cols-1 phone:[&>li:nth-child(n+7)]:hidden"
  >
    <li
      v-for="(track, index) in tracks"
      :key="`${track.path ?? ''}#${index}`"
      class="group/tile grid min-w-0 grid-cols-[44px_minmax(0,1fr)_27px] items-center gap-12 border-t border-line/70 py-8"
      @contextmenu.prevent="
        emit('menu', index, ($event.currentTarget as HTMLElement).querySelector('[data-track-menu]') as HTMLElement)
      "
    >
      <button
        type="button"
        :aria-label="`${playLabel} ${track.title}`"
        :disabled="disabled"
        class="relative size-44 overflow-hidden rounded-6 p-0"
        @click="emit('play', index)"
      >
        <Artwork :title="track.title" :cover="coverOf(track)" />
        <span
          class="absolute inset-0 grid place-items-center bg-[#0006] text-white opacity-0 transition-opacity duration-200 group-focus-within/tile:opacity-100 group-hover/tile:opacity-100"
          :class="{ 'opacity-100': currentPath !== null && track.path === currentPath }"
        >
          <UiIcon
            :name="currentPath !== null && track.path === currentPath ? 'music' : 'play'"
            class="size-16 fill-current"
          />
        </span>
      </button>
      <span class="min-w-0">
        <strong class="block truncate text-12 font-[550]">{{ track.title }}</strong>
        <small class="mt-3 block truncate text-11 text-muted">{{ track.artist || '—' }}</small>
      </span>
      <button
        type="button"
        data-track-menu
        :aria-label="`${menuLabel}: ${track.title}`"
        aria-haspopup="menu"
        class="grid size-27 place-items-center rounded-full text-24 leading-none font-light text-secondary hover:bg-hover hover:text-ink"
        @click="emit('menu', index, $event.currentTarget as HTMLElement)"
      >
        ⋯
      </button>
    </li>
  </ul>
</template>
