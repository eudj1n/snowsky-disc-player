<script setup lang="ts">
/** Grid of genre tiles: four across, three on tablets, two on phones. */
</script>

<template>
  <div
    class="grid grid-cols-4 gap-18 wide:gap-22 compact:grid-cols-3 compact:gap-14 rail:grid-cols-2 phone:gap-12 listening:grid-cols-3"
  >
    <slot />
  </div>
</template>
