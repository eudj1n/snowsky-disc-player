<script setup lang="ts">
/**
 * A page's views as tabs in its heading (the Card section's since round 16;
 * Settings' since 2026-10-02, owner: more settings will come): links, so each
 * view has its address and Back returns to it.
 */
import type { RouteLocationRaw } from 'vue-router'

defineProps<{ label: string; tabs: readonly { to: RouteLocationRaw; text: string; current: boolean }[] }>()
const TAB =
  'rounded-20 px-14 py-7 text-footnote font-medium text-muted hover:bg-hover hover:text-ink aria-[current=page]:bg-selected aria-[current=page]:text-ink'
</script>

<template>
  <nav :aria-label="label" class="flex flex-wrap gap-6 rounded-24 bg-soft p-4">
    <RouterLink
      v-for="tab in tabs"
      :key="tab.text"
      :to="tab.to"
      :class="TAB"
      :aria-current="tab.current ? 'page' : undefined"
      >{{ tab.text }}</RouterLink
    >
  </nav>
</template>
