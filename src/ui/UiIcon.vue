<script setup lang="ts">
/** One reference icon. 20px stroked by default; size and fill come from classes. */
import { ICON_PATHS, type IconName } from './icons'

defineProps<{ name: IconName }>()
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
    class="block size-20 shrink-0 fill-none stroke-current stroke-[1.7] [stroke-linecap:round] [stroke-linejoin:round]"
  >
    <path :d="ICON_PATHS[name]" />
  </svg>
</template>
