<script setup lang="ts">
/**
 * A 40px round action beside a pill button in a detail heading (owner,
 * 2026-09-28, after the Yandex Music album header): the icon speaks, the
 * name is its label and tooltip. Pressed turns accent.
 */
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
    class="inline-flex size-40 shrink-0 items-center justify-center rounded-full bg-soft text-ink transition-colors duration-150 hover:enabled:bg-hover disabled:opacity-50 aria-pressed:text-accent [&>svg]:size-17"
  >
    <UiIcon :name="icon" />
  </button>
</template>
