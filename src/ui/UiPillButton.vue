<script setup lang="ts">
/** Pill buttons after the reference .primary-button / .secondary-button. The
 * primary uses the player's ink green instead of the coral accent, which stays
 * for small indicators only (owner's design decision). */
import UiIcon from './UiIcon.vue'
import type { IconName } from './icons'

withDefaults(
  defineProps<{ variant?: 'primary' | 'secondary'; icon?: IconName; type?: 'button' | 'submit'; disabled?: boolean }>(),
  { variant: 'primary', icon: undefined, type: 'button', disabled: false },
)
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    class="inline-flex items-center justify-center gap-9 rounded-24 px-22 py-12 text-12 font-semibold [&>svg]:size-15"
    :class="
      variant === 'primary'
        ? 'bg-strong text-strong-ink hover:enabled:-translate-y-1 hover:enabled:bg-strong-hover'
        : 'bg-soft text-secondary'
    "
  >
    <UiIcon v-if="icon" :name="icon" />
    <slot />
  </button>
</template>
