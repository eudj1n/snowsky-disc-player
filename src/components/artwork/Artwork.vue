<script setup lang="ts">
/** Observed cover when known, otherwise the decorative typographic sleeve.
 * With `tone`, an observed cover reports its two colours (domain/coverColours.ts). */
import type { CoverColours } from '../../domain/coverColours'
import ArtworkSleeve from './ArtworkSleeve.vue'
import CoverCanvas from './CoverCanvas.vue'

withDefaults(defineProps<{ title: string | null; cover?: Blob | null; artist?: boolean; tone?: boolean }>(), {
  cover: null,
  artist: false,
  tone: false,
})
const emit = defineEmits<{ tone: [colours: CoverColours] }>()
</script>

<template>
  <CoverCanvas
    v-if="cover"
    :blob="cover"
    :tone="tone"
    class="group-hover:scale-[1.035] group-focus-visible:scale-[1.035] motion-reduce:group-hover:scale-100"
    @tone="(colours) => emit('tone', colours)"
  />
  <ArtworkSleeve v-else :title="title" :artist="artist" />
</template>
