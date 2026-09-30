<script setup lang="ts">
/**
 * The flat placeholder record (owner, 2026-09-29): a black disc with two faint
 * grooves and a label in the sleeve's colour (`--label`, `--label-ink` set by
 * the parent), whole, without a hole; the label may carry letters, centred,
 * left out when the record is small, or the album's cover. It stays round in
 * any box: its height sets its width. The parent positions it (relative or
 * absolute).
 */
import CoverCanvas from './CoverCanvas.vue'

defineProps<{ letters?: string | null; cover?: Blob | null }>()
</script>

<template>
  <span class="@container grid aspect-square place-items-center rounded-full bg-(--vinyl)">
    <span class="absolute inset-[9%] rounded-full shadow-[0_0_0_1px_var(--groove)]" />
    <span class="absolute inset-[20%] rounded-full shadow-[0_0_0_1px_var(--groove)]" />
    <span
      class="relative grid size-[40%] place-items-center overflow-hidden rounded-full bg-(--label) text-[13cqw] leading-none font-bold tracking-[-0.02em] text-(--label-ink)"
    >
      <CoverCanvas v-if="cover" :blob="cover" class="absolute inset-0 size-full" />
      <span v-else-if="letters" class="@max-[76px]:hidden">{{ letters }}</span>
    </span>
  </span>
</template>
