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
import SleeveRecord from '../artwork/SleeveRecord.vue'
import { sleeveColours } from '../artwork/sleeveColours'

const props = withDefaults(
  defineProps<{
    name: string
    caption: string
    to: RouteLocationRaw
    /** Up to three of its albums, the front one first. */
    records?: readonly { title: string; cover: Blob | null }[]
  }>(),
  { records: () => [] },
)
const colours = computed(() => sleeveColours(props.name))
/** Back to front, so the front record paints last; a genre without albums shows one of its own. */
const stack = computed(() => {
  const records = props.records.length ? props.records.slice(0, 2) : [{ title: props.name, cover: null }]
  return records.map((record, index) => ({ ...record, index })).reverse()
})
// Literal classes, the larger record first: two records against the top edge, the name and
// counts across the free band below (owner, 2026-09-29).
const PLACES = [
  'top-[-30%] h-[84%] right-[-6%] group-hover:rotate-[16deg]',
  'top-[-14%] h-[54%] right-[40%] group-hover:rotate-[-14deg]',
] as const
</script>

<template>
  <RouterLink
    :to="to"
    class="group relative block aspect-[16/10] overflow-hidden rounded-14 bg-(--tint) outline-offset-3"
    :style="colours"
  >
    <SleeveRecord
      v-for="record in stack"
      :key="record.index"
      aria-hidden="true"
      :cover="record.cover"
      :style="sleeveColours(record.title)"
      class="absolute shadow-[0_0_0_2px_var(--tint)] transition-transform duration-500 ease-[cubic-bezier(.22,.61,.36,1)] motion-reduce:transition-none"
      :class="PLACES[record.index]"
    />
    <span class="absolute right-14 bottom-12 left-14 text-(--tint-ink)">
      <strong class="block truncate text-17 font-bold tracking-[-0.3px] phone:text-14">{{ name }}</strong>
      <small class="mt-3 block truncate text-11 opacity-80">{{ caption }}</small>
    </span>
  </RouterLink>
</template>
