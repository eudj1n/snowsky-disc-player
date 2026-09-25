<script setup lang="ts">
/**
 * One album, artist or playlist card: square (or round) cover and title,
 * both opening the item, and caption lines, which may link elsewhere (an
 * album's artist opens the artist page).
 */
import type { RouteLocationRaw } from 'vue-router'
import Artwork from '../artwork/Artwork.vue'

export interface CardLine {
  text: string
  to?: RouteLocationRaw
}

withDefaults(
  defineProps<{
    title: string
    to: RouteLocationRaw
    lines?: CardLine[]
    artist?: boolean
    cover?: Blob | null
    openLabel: string
  }>(),
  { lines: () => [], artist: false, cover: null },
)
</script>

<template>
  <article class="min-w-0" :class="{ 'text-center': artist }">
    <RouterLink
      :to="to"
      :aria-label="openLabel"
      class="group relative block aspect-square w-full overflow-hidden bg-soft p-0 text-left after:absolute after:bottom-10 after:grid after:size-32 after:place-items-center after:rounded-full after:border after:border-[#ffffff30] after:bg-[#ffffff24] after:text-18 after:text-white after:opacity-0 after:backdrop-blur-[12px] after:transition-opacity after:duration-200 after:content-['↗'] hover:after:opacity-100 focus-visible:after:opacity-100"
      :class="artist ? 'rounded-full after:right-[calc(50%-16px)] after:bottom-14' : 'rounded-11 after:right-10'"
    >
      <Artwork :title="title" :artist="artist" :cover="cover" />
    </RouterLink>
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
