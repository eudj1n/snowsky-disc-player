<script setup lang="ts">
/** The "disc." word mark: a ringed disc and the word with a coral period. */
defineProps<{ label: string }>()
</script>

<template>
  <a
    href="#/"
    :aria-label="label"
    class="flex items-center gap-10 px-12 text-43 leading-none font-[750] tracking-[-3px] compact:text-38 slim:px-10 phone:hidden"
  >
    <span
      aria-hidden="true"
      class="relative inline-block size-34 shrink-0 rounded-full border-2 border-current after:absolute after:top-1/2 after:left-1/2 after:size-12 after:-translate-1/2 after:rounded-full after:border-2 after:border-current slim:size-30"
    />
    <span class="slim:hidden">disc<span class="text-accent">.</span></span>
  </a>
</template>
