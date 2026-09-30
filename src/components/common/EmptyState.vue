<script setup lang="ts">
/** Reference .empty-state: icon, heading, explanation and optional actions. */
import UiIcon from '../../ui/UiIcon.vue'
import type { IconName } from '../../ui/icons'

defineProps<{ icon: IconName; title: string; text?: string }>()
</script>

<template>
  <div class="px-20 py-80 text-center text-muted phone:px-15 phone:py-60" role="status">
    <UiIcon :name="icon" class="mx-auto size-42 text-muted" />
    <h2 class="my-[0.83em] text-26 font-semibold tracking-[-0.7px] text-ink phone:text-24">{{ title }}</h2>
    <p v-if="text" class="mx-auto mt-10 mb-24 max-w-380 text-12 leading-[1.8] phone:text-11">{{ text }}</p>
    <slot />
  </div>
</template>
