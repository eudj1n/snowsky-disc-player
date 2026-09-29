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
import { sleeve, SLEEVE_INK, SLEEVE_TONES } from '../../domain/artwork'

const props = withDefaults(defineProps<{ title: string | null; artist?: boolean }>(), { artist: false })
const shape = computed(() => sleeve(props.title))
const colours = computed(() => {
  const label = SLEEVE_TONES[shape.value.palette] ?? SLEEVE_TONES[0]
  return {
    '--label': label,
    '--label-ink': SLEEVE_INK[shape.value.palette] ?? '#fff',
    // A monogram: the colour faint over the theme's surface, its letters in the colour.
    '--tint': `color-mix(in srgb, ${label} 22%, var(--soft))`,
    '--tint-ink': `color-mix(in srgb, ${label} 78%, var(--ink))`,
  }
})
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
      class="text-[30cqw] leading-none font-[700] tracking-[-0.04em] text-(--tint-ink) @max-[48px]:hidden"
      >{{ shape.letters }}</span
    >
    <span v-else class="relative grid size-[84%] place-items-center rounded-full bg-(--vinyl)">
      <span class="absolute inset-[9%] rounded-full shadow-[0_0_0_1px_var(--groove)]" />
      <span class="absolute inset-[20%] rounded-full shadow-[0_0_0_1px_var(--groove)]" />
      <span
        class="relative grid size-[40%] place-items-center rounded-full bg-(--label) text-[11cqw] leading-none font-[700] tracking-[-0.02em] text-(--label-ink)"
        ><span class="@max-[64px]:hidden">{{ shape.letters }}</span></span
      >
    </span>
  </div>
</template>
