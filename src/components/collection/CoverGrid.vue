<script setup lang="ts">
/** Reference .album-grid: 4 columns, 3 on tablets, 2 on phones. The Home
 * variant shows three cards on tablets and all four again on phones. With the
 * listening panel open, as many 145px columns as fit, but never more than 4
 * (owner, 2026-09-29: eight were too small): a column is at least a quarter
 * of the grid, less the widest gaps. */
withDefaults(defineProps<{ home?: boolean }>(), { home: false })
</script>

<template>
  <div
    class="grid grid-cols-4 gap-x-20 gap-y-24 wide:gap-26 compact:gap-x-14 compact:gap-y-20 rail:grid-cols-3 phone:grid-cols-2 phone:gap-x-15 phone:gap-y-22 listening:grid-cols-[repeat(auto-fill,minmax(max(145px,calc((100%_-_80px)/4)),1fr))]"
    :class="{ 'rail:[&>*:nth-child(4)]:hidden phone:[&>*:nth-child(4)]:block': home }"
  >
    <slot />
  </div>
</template>
