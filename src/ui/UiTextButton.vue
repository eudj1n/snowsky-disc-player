<script setup lang="ts">
/** Quiet text action with an optional trailing icon (reference .text-button). */
import UiIcon from './UiIcon.vue'
import type { IconName } from './icons'

withDefaults(defineProps<{ icon?: IconName; disabled?: boolean }>(), { icon: undefined, disabled: false })
</script>

<template>
  <button
    type="button"
    :disabled="disabled"
    class="flex items-center gap-6 text-12 text-muted hover:enabled:text-ink [&>svg]:size-14"
  >
    <slot />
    <UiIcon v-if="icon" :name="icon" />
  </button>
</template>
