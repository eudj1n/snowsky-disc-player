<script setup lang="ts">
/** A horizontal shelf of cards that scrolls and snaps card by card. */
defineProps<{ label: string }>()
</script>

<template>
  <div
    role="list"
    :aria-label="label"
    class="-mx-4 flex snap-x snap-mandatory [scrollbar-width:thin] gap-20 overflow-x-auto overscroll-x-contain scroll-smooth px-4 pb-8 *:w-[clamp(140px,17vw,210px)] *:shrink-0 *:snap-start motion-reduce:scroll-auto phone:gap-15"
  >
    <slot />
  </div>
</template>
