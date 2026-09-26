<script setup lang="ts">
/**
 * One album, artist or playlist card: square (or round) cover and title,
 * both opening the item, and caption lines, which may link elsewhere (an
 * album's artist opens the artist page). With a play label, a round play
 * button appears over the cover on hover or focus and emits `play`; touch
 * screens without hover never get an invisible button over the cover.
 */
import type { RouteLocationRaw } from 'vue-router'
import UiIcon from '../../ui/UiIcon.vue'
import Artwork from '../artwork/Artwork.vue'

import type { CardLine } from './cardLine'
export type { CardLine } from './cardLine'

withDefaults(
  defineProps<{
    title: string
    to: RouteLocationRaw
    lines?: CardLine[]
    artist?: boolean
    cover?: Blob | null
    openLabel: string
    playLabel?: string | null
    playDisabled?: boolean
  }>(),
  { lines: () => [], artist: false, cover: null, playLabel: null, playDisabled: false },
)
const emit = defineEmits<{ play: [] }>()
</script>

<template>
  <article class="group/card min-w-0" :class="{ 'text-center': artist }">
    <div class="relative">
      <RouterLink
        :to="to"
        :aria-label="openLabel"
        class="group relative block aspect-square w-full overflow-hidden bg-soft p-0 text-left"
        :class="artist ? 'rounded-full' : 'rounded-11'"
      >
        <Artwork :title="title" :artist="artist" :cover="cover" />
      </RouterLink>
      <button
        v-if="playLabel"
        type="button"
        :aria-label="playLabel"
        :title="playLabel"
        :disabled="playDisabled"
        class="absolute grid size-36 translate-y-4 place-items-center rounded-full border border-[#ffffff40] bg-[#ffffff2e] p-0 text-white opacity-0 shadow-[0_6px_18px_#0003] backdrop-blur-[12px] transition-[opacity,transform,background-color] duration-200 group-focus-within/card:translate-y-0 group-focus-within/card:opacity-100 group-hover/card:translate-y-0 group-hover/card:opacity-100 hover:enabled:scale-[1.06] hover:enabled:bg-[#ffffff45] disabled:cursor-default motion-reduce:translate-y-0 motion-reduce:transition-none [@media(hover:none)]:hidden"
        :class="artist ? 'right-[calc(50%-18px)] bottom-14' : 'right-10 bottom-10'"
        @click="emit('play')"
      >
        <UiIcon name="play" filled class="size-15 translate-x-1" />
      </button>
    </div>
    <h3 class="mt-12 mb-5 truncate text-12 font-semibold wide:text-14 phone:text-12">
      <RouterLink :to="to" tabindex="-1" class="hover:underline hover:underline-offset-3">{{ title }}</RouterLink>
    </h3>
    <p v-if="lines.length" class="m-0 text-10 text-muted wide:text-12 phone:text-10">
      <span v-for="line in lines" :key="line.text" class="block truncate leading-[1.6]">
        <RouterLink v-if="line.to" :to="line.to" class="hover:text-ink hover:underline hover:underline-offset-3">{{
          line.text
        }}</RouterLink>
        <template v-else>{{ line.text }}</template>
      </span>
    </p>
  </article>
</template>
