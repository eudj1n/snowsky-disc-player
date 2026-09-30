<script setup lang="ts">
/** Pill buttons after the reference .primary-button / .secondary-button. The
 * primary uses the player's ink green instead of the coral accent, which stays
 * for small indicators only (owner's design decision). Play and pause draw a
 * solid glyph, and hovering changes only the background (owner, 2026-09-29: no
 * movement). */
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
    class="inline-flex items-center justify-center gap-9 rounded-24 px-22 py-12 text-13 leading-none font-semibold tracking-[0.1px] transition-colors duration-150 [&>svg]:size-14"
    :class="
      variant === 'primary'
        ? 'bg-strong text-strong-ink hover:enabled:bg-strong-hover'
        : 'bg-soft text-secondary hover:enabled:bg-hover hover:enabled:text-ink'
    "
  >
    <UiIcon v-if="icon" :name="icon" :filled="icon === 'play' || icon === 'pause'" />
    <slot />
  </button>
</template>
