<script setup lang="ts">
/** Reference detail header: 220px sleeve, name, meta line, actions. The
 * entity type is left out: the breadcrumb already names the section. A quiet
 * rule separates the header from the content below it. */
import Artwork from '../artwork/Artwork.vue'

withDefaults(defineProps<{ title: string; artist?: boolean; cover?: Blob | null }>(), { artist: false, cover: null })
</script>

<template>
  <div
    class="mt-25 mb-26 flex items-end gap-30 border-b border-line pb-30 rail:gap-22 phone:mt-23 phone:mb-20 phone:block phone:pb-23 phone:text-center"
  >
    <div
      class="aspect-square w-220 shrink-0 overflow-hidden shadow-[0_12px_40px_#25341515] rail:w-165 phone:mx-auto phone:mb-25 phone:w-200"
      :class="artist ? 'rounded-full' : 'rounded-12'"
    >
      <Artwork :title="title" :artist="artist" :cover="cover" />
    </div>
    <div class="min-w-0">
      <h1
        class="mt-0 mb-14 text-42 leading-[1.08] font-bold tracking-[-1.5px] [overflow-wrap:anywhere] rail:text-34 phone:text-32"
      >
        {{ title }}
      </h1>
      <p class="m-0 text-12 text-muted phone:text-11"><slot name="meta" /></p>
      <div class="mt-25 flex items-center gap-10 empty:hidden phone:mt-20 phone:justify-center"><slot /></div>
    </div>
  </div>
</template>
