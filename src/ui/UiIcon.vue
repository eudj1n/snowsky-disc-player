<script setup lang="ts">
/** One reference icon. 20px stroked by default; `filled` also fills the shape
 * with the current color. Size comes from classes. */
import { ICON_PATHS, type IconName } from './icons'

withDefaults(defineProps<{ name: IconName; filled?: boolean }>(), { filled: false })
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
    class="block size-20 shrink-0 stroke-current stroke-[1.7] [stroke-linecap:round] [stroke-linejoin:round]"
    :class="filled ? 'fill-current' : 'fill-none'"
  >
    <path :d="ICON_PATHS[name]" />
  </svg>
</template>
