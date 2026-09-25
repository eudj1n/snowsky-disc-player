<script lang="ts">
/** Inline SVG icons (no icon fonts or external sprites under the gateway CSP). */
const PATHS = {
  play: 'M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z',
  pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  previous: 'M6 5h2v14H6zM19 5.87v12.26a.8.8 0 0 1-1.22.68L9.5 12.68a.8.8 0 0 1 0-1.36l8.28-6.13A.8.8 0 0 1 19 5.87Z',
  next: 'M16 5h2v14h-2zM5 5.87v12.26a.8.8 0 0 0 1.22.68l8.28-6.13a.8.8 0 0 0 0-1.36L6.22 5.19A.8.8 0 0 0 5 5.87Z',
  refresh:
    'M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.74 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z',
} as const
export type IconName = keyof typeof PATHS
</script>

<script setup lang="ts">
defineProps<{ name: IconName }>()
</script>

<template>
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path :d="PATHS[name]" /></svg>
</template>
