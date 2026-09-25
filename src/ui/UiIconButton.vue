<script setup lang="ts">
/** Round 34px icon button (reference .icon-button). Pressed state turns accent. */
import UiIcon from './UiIcon.vue'
import type { IconName } from './icons'

withDefaults(defineProps<{ icon: IconName; label: string; pressed?: boolean | undefined; disabled?: boolean }>(), {
  pressed: undefined,
  disabled: false,
})
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :title="label"
    :aria-pressed="pressed"
    :disabled="disabled"
    class="inline-flex size-34 shrink-0 items-center justify-center rounded-full p-6 text-secondary hover:enabled:bg-hover hover:enabled:text-ink aria-pressed:text-accent aria-pressed:[&>svg]:stroke-2"
  >
    <UiIcon :name="icon" />
  </button>
</template>
