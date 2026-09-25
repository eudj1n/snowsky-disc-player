<script setup lang="ts">
/** Reference .connection-status pill with a leading dot. */
defineProps<{ text: string; connected: boolean }>()
</script>

<template>
  <p
    role="status"
    class="mb-20 rounded-10 px-14 py-11 text-12 before:mr-8 before:inline-block before:size-6 before:rounded-full before:content-['']"
    :class="connected ? 'bg-banner text-secondary before:bg-secondary' : 'bg-surface text-muted before:bg-muted'"
    data-testid="connection-state"
  >
    {{ text }}
  </p>
</template>
