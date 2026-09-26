<script setup lang="ts">
/**
 * A genre as a wide tile: the typographic sleeve of its name as the
 * background, the name and counts over a soft shade. The whole tile opens
 * the genre.
 */
import type { RouteLocationRaw } from 'vue-router'
import ArtworkSleeve from '../artwork/ArtworkSleeve.vue'

defineProps<{ name: string; caption: string; to: RouteLocationRaw }>()
</script>

<template>
  <RouterLink
    :to="to"
    class="group relative block aspect-[16/10] overflow-hidden rounded-14 shadow-[0_8px_24px_#25341512] outline-offset-3"
  >
    <ArtworkSleeve :title="name" />
    <span
      class="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,#0000004d)] transition-opacity duration-300 group-hover:opacity-80"
    />
    <span class="absolute inset-x-14 bottom-12 text-white">
      <strong class="block truncate text-17 font-bold tracking-[-0.3px] phone:text-14">{{ name }}</strong>
      <small class="mt-3 block truncate text-11 text-white/80">{{ caption }}</small>
    </span>
  </RouterLink>
</template>
