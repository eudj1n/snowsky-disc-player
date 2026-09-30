<script setup lang="ts">
import UiIcon from '../../ui/UiIcon.vue'

defineProps<{ eyebrow: string; title: string; note?: string }>()
</script>

<template>
  <div class="mb-24 flex items-end justify-between phone:mb-20">
    <div>
      <span class="text-caption2 font-semibold tracking-caps text-muted uppercase">{{ eyebrow }}</span>
      <h1 class="mt-9 mb-0 text-title1 font-bold tracking-title">{{ title }}</h1>
    </div>
    <span v-if="note" class="flex items-center gap-7 text-footnote text-muted compact:hidden">
      <UiIcon name="music" class="size-14" />{{ note }}
    </span>
  </div>
</template>
