<script setup lang="ts">
/** Reference .album-grid: 4 columns, 3 on tablets, 2 on phones. The Home
 * variant shows three cards on tablets and all four again on phones. */
withDefaults(defineProps<{ home?: boolean }>(), { home: false })
</script>

<template>
  <div
    class="grid grid-cols-4 gap-x-20 gap-y-24 wide:gap-26 compact:gap-x-14 compact:gap-y-20 rail:grid-cols-3 phone:grid-cols-2 phone:gap-x-15 phone:gap-y-22 listening:grid-cols-[repeat(auto-fill,minmax(145px,1fr))]"
    :class="{ 'rail:[&>*:nth-child(4)]:hidden phone:[&>*:nth-child(4)]:block': home }"
  >
    <slot />
  </div>
</template>
