<script setup lang="ts">
import UiIcon from '../../ui/UiIcon.vue'

defineProps<{ eyebrow: string; title: string; note?: string }>()
</script>

<template>
  <div class="mb-24 flex items-end justify-between phone:mb-20">
    <div>
      <span class="text-9 font-[650] tracking-[1.8px] text-muted uppercase phone:text-8">{{ eyebrow }}</span>
      <h1 class="mt-9 mb-0 text-32 font-[650] tracking-[-1.1px] phone:text-27">{{ title }}</h1>
    </div>
    <span v-if="note" class="flex items-center gap-7 text-11 text-muted compact:hidden">
      <UiIcon name="music" class="size-14" />{{ note }}
    </span>
  </div>
</template>
