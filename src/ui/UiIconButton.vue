<script setup lang="ts">
/** Round icon-only button; the label is required for assistive technology. */
import UiIcon, { type IconName } from './UiIcon.vue'

withDefaults(defineProps<{ icon: IconName; label: string; primary?: boolean; disabled?: boolean }>(), {
  primary: false,
  disabled: false,
})
</script>

<template>
  <button
    type="button"
    :disabled="disabled"
    :aria-label="label"
    :title="label"
    class="inline-flex items-center justify-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral disabled:cursor-not-allowed disabled:opacity-45"
    :class="
      primary
        ? 'size-14 border-coral bg-coral text-coral-ink hover:enabled:brightness-105'
        : 'size-11 border-line text-ink hover:enabled:border-muted'
    "
  >
    <UiIcon :name="icon" :class="primary ? 'size-6' : 'size-5'" />
  </button>
</template>
