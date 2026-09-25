<script setup lang="ts">
/** Reference .view-heading for collection lists: eyebrow, title, count line.
 * A null meta (count still loading) keeps its line as a skeleton. */
import UiSkeleton from '../../ui/UiSkeleton.vue'

defineProps<{ eyebrow: string; title: string; meta: string | null }>()
</script>

<template>
  <div class="mt-5 mb-28 flex flex-wrap items-end justify-between gap-x-20 gap-y-14">
    <div>
      <span class="text-9 font-[650] tracking-[1.8px] text-muted uppercase phone:text-8">{{ eyebrow }}</span>
      <h1 class="mt-10 mb-7 text-32 font-bold tracking-[-1px] phone:text-29">{{ title }}</h1>
      <p v-if="meta !== null" class="m-0 text-11 text-muted">{{ meta }}</p>
      <div v-else class="flex h-[1lh] items-center text-11"><UiSkeleton class="h-[0.8em] w-110" /></div>
    </div>
    <slot />
  </div>
</template>
