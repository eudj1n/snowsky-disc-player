<script setup lang="ts">
/** Reference .section-heading: title with optional small subtitle and an action. */
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <div class="mt-31 mb-18 flex items-center justify-between gap-10 wide:mt-38 phone:mt-26">
    <h2 class="m-0 text-19 font-[650] tracking-[-0.5px] wide:text-22 phone:text-18">
      {{ title }}
      <small v-if="subtitle" class="mt-7 block text-11 font-normal tracking-normal text-muted phone:text-10">{{
        subtitle
      }}</small>
    </h2>
    <slot />
  </div>
</template>
