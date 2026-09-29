<script setup lang="ts">
/**
 * A genre's records on its tint (owner, 2026-09-29: an album is a record, a
 * genre a collection of them): two of its albums' records, a larger and a
 * smaller one, their labels the albums' covers (else their colours). A genre
 * without albums shows one of its own. The `tile` layout sets them against
 * the top edge of a wide tile, leaving a band below for its name, and turns
 * them a little on the tile's hover; the `square` layout sets them across a
 * square sleeve, as the genre page's heading shows it. The parent positions
 * it (relative or absolute) and sets its box. A ring in the genre's tint
 * parts the records where they overlap. Decorative.
 */
import { computed } from 'vue'
import SleeveRecord from '../artwork/SleeveRecord.vue'
import { sleeveColours } from '../artwork/sleeveColours'

const props = withDefaults(
  defineProps<{
    name: string
    /** Up to two of its albums, the front one first. */
    records?: readonly { title: string; cover: Blob | null }[]
    layout?: 'tile' | 'square'
  }>(),
  { records: () => [], layout: 'tile' },
)
/** The genre's colours; `--ground` keeps its tint for the rings under the records' own colours. */
const ground = computed(() => ({ ...sleeveColours(props.name), '--ground': 'var(--tint)' }))
/** Back to front, so the front record paints last. */
const stack = computed(() => {
  const records = props.records.length ? props.records.slice(0, 2) : [{ title: props.name, cover: null }]
  return records.map((record, index) => ({ ...record, index })).reverse()
})
// Literal classes, the larger (front) record first.
const PLACES = {
  tile: [
    'top-[-30%] h-[84%] right-[-6%] group-hover:rotate-[16deg]',
    'top-[-14%] h-[54%] right-[40%] group-hover:rotate-[-14deg]',
  ],
  square: ['top-[-16%] h-[86%] right-[-16%]', 'bottom-[7%] h-[52%] left-[7%]'],
} as const
</script>

<template>
  <span aria-hidden="true" class="block overflow-hidden bg-(--tint)" :style="ground">
    <SleeveRecord
      v-for="record in stack"
      :key="record.index"
      :cover="record.cover"
      :style="sleeveColours(record.title)"
      data-testid="genre-record"
      class="absolute shadow-[0_0_0_2px_var(--ground)] transition-transform duration-500 ease-[cubic-bezier(.22,.61,.36,1)] motion-reduce:transition-none"
      :class="PLACES[layout][record.index]"
    />
  </span>
</template>
