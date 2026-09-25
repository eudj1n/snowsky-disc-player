<script setup lang="ts">
/** One album, artist or playlist card: square cover button, title, caption lines. */
import ArtworkSleeve from '../artwork/ArtworkSleeve.vue'

withDefaults(defineProps<{ title: string; lines?: string[]; artist?: boolean; openLabel: string }>(), {
  lines: () => [],
  artist: false,
})
const emit = defineEmits<{ open: [] }>()
</script>

<template>
  <article class="min-w-0" :class="{ 'text-center': artist }">
    <button
      type="button"
      :aria-label="openLabel"
      class="group relative block aspect-square w-full overflow-hidden bg-soft p-0 text-left after:absolute after:bottom-10 after:grid after:size-32 after:place-items-center after:rounded-full after:border after:border-[#ffffff30] after:bg-[#ffffff24] after:text-18 after:text-white after:opacity-0 after:backdrop-blur-[12px] after:transition-opacity after:duration-200 after:content-['↗'] hover:after:opacity-100 focus-visible:after:opacity-100"
      :class="artist ? 'rounded-full after:right-[calc(50%-16px)] after:bottom-14' : 'rounded-11 after:right-10'"
      @click="emit('open')"
    >
      <ArtworkSleeve :title="title" :artist="artist" />
    </button>
    <h3 class="mt-12 mb-5 truncate text-12 font-semibold wide:text-14 phone:text-12">{{ title }}</h3>
    <p v-if="lines.length" class="m-0 text-10 text-muted wide:text-12 phone:text-10">
      <span v-for="line in lines" :key="line" class="block truncate leading-[1.6]">{{ line }}</span>
    </p>
  </article>
</template>
