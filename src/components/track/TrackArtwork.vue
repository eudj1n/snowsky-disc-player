<script setup lang="ts">
/** Decorative typographic sleeve for a track or album without observed artwork.
 * It never counts as a cover: the palette and initials derive from the title only. */
import { computed } from 'vue'

const props = withDefaults(defineProps<{ title: string | null; size?: 'md' | 'lg' }>(), { size: 'md' })

const PALETTES = [
  'bg-[#e9d8c4] text-[#6b3f24]',
  'bg-[#cfe0d6] text-[#1f3a33]',
  'bg-[#f3d1c6] text-[#7a2f1d]',
  'bg-[#d7d9ee] text-[#2d3170]',
  'bg-[#e8e2c8] text-[#5a4a12]',
  'bg-[#d3e4e8] text-[#1d4b57]',
] as const

const palette = computed(() => {
  let hash = 0
  for (const char of props.title ?? '') hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  return PALETTES[hash % PALETTES.length]
})
const initials = computed(() =>
  (props.title ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? '')
    .join(''),
)
</script>

<template>
  <div
    aria-hidden="true"
    class="grid shrink-0 place-items-center rounded-xl font-semibold select-none"
    :class="[palette, size === 'lg' ? 'size-28 text-3xl' : 'size-14 text-lg']"
  >
    {{ initials || '♪' }}
  </div>
</template>
