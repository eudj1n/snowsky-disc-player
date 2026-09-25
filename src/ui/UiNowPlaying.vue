<script setup lang="ts">
/**
 * Current-track marker: a dot in the current text color. While the track
 * plays, a halo expands from it and the dot breathes; paused, it rests.
 * Reduced motion keeps the still dot.
 */
defineProps<{ playing: boolean }>()
</script>

<template>
  <span aria-hidden="true" class="relative inline-grid size-12 place-items-center" :data-playing="playing">
    <span
      v-if="playing"
      class="absolute inset-0 animate-now-halo rounded-full bg-current motion-reduce:hidden motion-reduce:animate-none"
    />
    <span
      class="relative size-7 rounded-full bg-current"
      :class="{ 'animate-now-breathe motion-reduce:animate-none': playing }"
    />
  </span>
</template>
