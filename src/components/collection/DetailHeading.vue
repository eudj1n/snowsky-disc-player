<script setup lang="ts">
/** Reference detail header: 220px sleeve, name, meta line, actions. The
 * entity type is left out: the sidebar marks the section. A soft
 * glow in the artwork's tone (the observed cover's average color, else the
 * sleeve palette) sits behind it, and a quiet rule separates it from the
 * content below. */
import { computed, ref, watch } from 'vue'
import { sleeve, SLEEVE_TONES } from '../../domain/artwork'
import Artwork from '../artwork/Artwork.vue'

const props = withDefaults(defineProps<{ title: string; artist?: boolean; cover?: Blob | null }>(), {
  artist: false,
  cover: null,
})
const observed = ref<string | null>(null)
watch(
  () => props.cover,
  (cover) => {
    if (!cover) observed.value = null
  },
)
const tint = computed(() => observed.value ?? SLEEVE_TONES[sleeve(props.title).palette] ?? SLEEVE_TONES[0])
</script>

<template>
  <div
    class="relative isolate mt-25 mb-26 flex items-end gap-30 border-b border-line pb-30 rail:gap-22 phone:mt-23 phone:mb-20 phone:block phone:pb-23 phone:text-center"
    :style="{ '--tint': tint }"
  >
    <span
      aria-hidden="true"
      class="pointer-events-none absolute -inset-x-40 -top-70 bottom-0 -z-10 bg-[radial-gradient(closest-side_at_24%_55%,color-mix(in_oklab,var(--tint)_34%,transparent),transparent)] transition-[--tint] duration-700 dark:opacity-80 wide:-inset-x-56 compact:-inset-x-24 phone:-inset-x-16 phone:bg-[radial-gradient(closest-side_at_50%_40%,color-mix(in_oklab,var(--tint)_34%,transparent),transparent)] listening:-inset-x-28"
    />
    <div
      class="aspect-square w-220 shrink-0 overflow-hidden shadow-[0_12px_40px_#25341515] rail:w-165 phone:mx-auto phone:mb-25 phone:w-200"
      :class="artist ? 'rounded-full' : 'rounded-12'"
    >
      <Artwork :title="title" :artist="artist" :cover="cover" tone @tone="(color) => (observed = color)" />
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
