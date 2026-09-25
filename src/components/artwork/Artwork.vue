<script setup lang="ts">
/** Observed cover when known, otherwise the decorative typographic sleeve. */
import ArtworkSleeve from './ArtworkSleeve.vue'
import CoverCanvas from './CoverCanvas.vue'

withDefaults(defineProps<{ title: string | null; cover?: Blob | null; artist?: boolean }>(), {
  cover: null,
  artist: false,
})
</script>

<template>
  <CoverCanvas v-if="cover" :blob="cover" class="transition-transform duration-400 group-hover:scale-[1.045]" />
  <ArtworkSleeve v-else :title="title" :artist="artist" />
</template>
