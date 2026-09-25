<script setup lang="ts">
/** Short status text announced politely to assistive technology. */
withDefaults(defineProps<{ tone?: 'warning' | 'info' }>(), { tone: 'warning' })
</script>

<template>
  <p role="status" class="my-2 text-sm" :class="tone === 'warning' ? 'text-warn' : 'text-muted'"><slot /></p>
</template>
