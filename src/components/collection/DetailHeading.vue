<script setup lang="ts">
/** Reference detail header: 220px sleeve, name, meta line, actions. The
 * entity type is left out: the breadcrumb already names the section. */
import ArtworkSleeve from '../artwork/ArtworkSleeve.vue'

withDefaults(defineProps<{ title: string; artist?: boolean }>(), { artist: false })
</script>

<template>
  <div class="mt-25 mb-30 flex items-end gap-30 rail:gap-22 phone:my-23 phone:block phone:text-center">
    <div
      class="aspect-square w-220 shrink-0 overflow-hidden shadow-[0_12px_40px_#25341515] rail:w-165 phone:mx-auto phone:mb-25 phone:w-200"
      :class="artist ? 'rounded-full' : 'rounded-12'"
    >
      <ArtworkSleeve :title="title" :artist="artist" />
    </div>
    <div class="min-w-0">
      <h1
        class="mt-0 mb-14 text-42 leading-[1.08] font-bold tracking-[-1.5px] [overflow-wrap:anywhere] rail:text-34 phone:text-32"
      >
        {{ title }}
      </h1>
      <p class="mt-0 mb-25 text-12 text-muted phone:mb-20 phone:text-11"><slot name="meta" /></p>
      <div class="flex items-center gap-10 phone:justify-center"><slot /></div>
    </div>
  </div>
</template>
