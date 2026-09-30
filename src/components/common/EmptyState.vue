<script setup lang="ts">
/** Reference .empty-state: icon, heading, explanation and optional actions. */
import UiIcon from '../../ui/UiIcon.vue'
import type { IconName } from '../../ui/icons'

defineProps<{ icon: IconName; title: string; text?: string }>()
</script>

<template>
  <div class="px-20 py-80 text-center text-muted phone:px-15 phone:py-60" role="status">
    <UiIcon :name="icon" class="mx-auto size-42 text-muted" />
    <h2 class="my-[0.83em] text-title2 font-semibold tracking-heading text-ink">{{ title }}</h2>
    <p v-if="text" class="mx-auto mt-10 mb-24 max-w-380 text-footnote leading-[1.55]">{{ text }}</p>
    <slot />
  </div>
</template>
