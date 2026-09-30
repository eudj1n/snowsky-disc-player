<script setup lang="ts">
/**
 * A genre as a wide tile (owner, 2026-09-29: an album is a record, a genre a
 * collection of them): the genre's colour faint over the theme's surface,
 * two of its albums' records, a larger and a smaller one, against the top
 * edge, their labels the albums' covers (else their colours), turning a little
 * on hover; the name and counts across the free band below, in the colour. The whole
 * tile opens the genre.
 */
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { sleeveColours } from '../artwork/sleeveColours'
import GenreRecords from './GenreRecords.vue'

const props = withDefaults(
  defineProps<{
    name: string
    caption: string
    to: RouteLocationRaw
    /** Up to two of its albums, the front one first. */
    records?: readonly { title: string; cover: Blob | null }[]
  }>(),
  { records: () => [] },
)
const colours = computed(() => sleeveColours(props.name))
</script>

<template>
  <RouterLink
    :to="to"
    class="group relative block aspect-[16/10] overflow-hidden rounded-14 bg-(--tint) outline-offset-3"
    :style="colours"
  >
    <GenreRecords :name="name" :records="records" class="absolute inset-0" />
    <span class="absolute right-14 bottom-12 left-14 text-(--tint-ink)">
      <strong class="block truncate text-title3 font-bold tracking-heading">{{ name }}</strong>
      <small class="mt-3 block truncate text-footnote opacity-80">{{ caption }}</small>
    </span>
  </RouterLink>
</template>
