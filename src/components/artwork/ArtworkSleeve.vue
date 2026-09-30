<script setup lang="ts">
/**
 * Placeholder for an album, artist, playlist or track without observed
 * artwork (owner, 2026-09-29: flat, in the player's own look and colours).
 * Albums and tracks get a flat vinyl record, as the SNOWSKY DISC shows one,
 * whose label carries the title's letters in one of six colours from the
 * page; artists a round monogram tinted in the same colour. No hole, no
 * gradient: the record reads whole. Decorative: hidden from assistive
 * technology. The letters leave tiny sleeves (list rows) to the colour alone.
 */
import { computed } from 'vue'
import { sleeve } from '../../domain/artwork'
import SleeveRecord from './SleeveRecord.vue'
import { sleeveColours } from './sleeveColours'

const props = withDefaults(defineProps<{ title: string | null; artist?: boolean }>(), { artist: false })
const letters = computed(() => sleeve(props.title).letters)
const colours = computed(() => sleeveColours(props.title))
</script>

<template>
  <div
    aria-hidden="true"
    class="@container grid size-full place-items-center overflow-hidden transition-[scale] duration-[800ms] ease-[cubic-bezier(.22,.61,.36,1)] group-hover:scale-[1.035] group-focus-visible:scale-[1.035] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
    :class="artist ? 'bg-(--tint)' : 'bg-soft'"
    :style="colours"
    data-testid="sleeve"
  >
    <span
      v-if="artist"
      class="text-[30cqw] leading-none font-bold tracking-[-0.04em] text-(--tint-ink) @max-[48px]:hidden"
      >{{ letters }}</span
    >
    <SleeveRecord v-else :letters="letters" class="relative h-[84%]" />
  </div>
</template>
