<script setup lang="ts">
/** Round 34px icon button (reference .icon-button), or 28px with a 16px icon when `small`. Pressed state turns accent. */
import UiIcon from './UiIcon.vue'
import type { IconName } from './icons'

withDefaults(
  defineProps<{ icon: IconName; label: string; pressed?: boolean | undefined; disabled?: boolean; small?: boolean }>(),
  { pressed: undefined, disabled: false, small: false },
)
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :title="label"
    :aria-pressed="pressed"
    :disabled="disabled"
    class="inline-flex shrink-0 items-center justify-center rounded-full p-6 text-secondary hover:enabled:bg-hover hover:enabled:text-ink aria-pressed:text-accent aria-pressed:[&>svg]:stroke-2"
    :class="small ? 'size-28 [&>svg]:size-16' : 'size-34'"
  >
    <UiIcon :name="icon" />
  </button>
</template>
