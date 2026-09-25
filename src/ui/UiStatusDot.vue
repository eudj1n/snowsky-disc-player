<script setup lang="ts">
defineProps<{ tone: 'idle' | 'busy' | 'ok' }>()
</script>

<template>
  <span
    aria-hidden="true"
    class="inline-block size-2.5 rounded-full"
    :class="{ 'bg-line': tone === 'idle', 'bg-coral': tone === 'busy', 'bg-ok': tone === 'ok' }"
  />
</template>
