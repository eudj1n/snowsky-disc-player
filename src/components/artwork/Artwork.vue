<script setup lang="ts">
/** Observed cover when known, otherwise the decorative typographic sleeve.
 * With `tone`, an observed cover reports its average color. */
import ArtworkSleeve from './ArtworkSleeve.vue'
import CoverCanvas from './CoverCanvas.vue'

withDefaults(defineProps<{ title: string | null; cover?: Blob | null; artist?: boolean; tone?: boolean }>(), {
  cover: null,
  artist: false,
  tone: false,
})
const emit = defineEmits<{ tone: [color: string] }>()
</script>

<template>
  <CoverCanvas
    v-if="cover"
    :blob="cover"
    :tone="tone"
    class="group-hover:scale-[1.045]"
    @tone="(color) => emit('tone', color)"
  />
  <ArtworkSleeve v-else :title="title" :artist="artist" />
</template>
