<script setup lang="ts">
/** Loading placeholder with the exact geometry of CoverCard: square (or
 * round) cover, a title line and caption lines of the same heights. */
import UiSkeleton from '../../ui/UiSkeleton.vue'

withDefaults(defineProps<{ artist?: boolean; lines?: number }>(), { artist: false, lines: 2 })
</script>

<template>
  <div aria-hidden="true" class="min-w-0">
    <UiSkeleton class="aspect-square w-full" :class="artist ? 'rounded-full' : 'rounded-11'" />
    <div
      class="mt-12 mb-5 flex h-[1lh] items-center text-12 wide:text-14 phone:text-12"
      :class="{ 'justify-center': artist }"
    >
      <UiSkeleton class="h-[0.8em] w-[68%]" />
    </div>
    <div
      v-for="line in lines"
      :key="line"
      class="flex h-[1.6em] items-center text-11 wide:text-12 phone:text-11"
      :class="{ 'justify-center': artist }"
    >
      <UiSkeleton class="h-[0.75em]" :class="line === 1 ? 'w-[52%]' : 'w-[34%]'" />
    </div>
  </div>
</template>
