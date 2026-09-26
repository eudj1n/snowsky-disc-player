<script setup lang="ts">
/**
 * Frame for a native select: the browser's own arrow sat almost on the edge
 * of rounded selects (owner, round 14), so the select inside loses it and
 * the frame draws a chevron within the select's right padding. The select
 * stays native (keyboard, phone pickers); only its arrow is replaced.
 */
import UiIcon from './UiIcon.vue'

withDefaults(defineProps<{ size?: 'sm' | 'md'; block?: boolean }>(), { size: 'md', block: false })
</script>

<template>
  <span
    class="relative items-center [&>select]:appearance-none"
    :class="[
      block ? 'grid w-full' : 'inline-grid',
      size === 'sm' ? '[&>select]:pr-24 phone:[&>select]:pr-23' : '[&>select]:pr-32',
    ]"
  >
    <slot />
    <UiIcon
      name="chevron"
      class="pointer-events-none absolute !stroke-2 text-muted"
      :class="size === 'sm' ? 'right-8 size-10 phone:right-7' : 'right-13 size-12'"
    />
  </span>
</template>
