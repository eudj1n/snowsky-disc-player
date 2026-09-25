<script setup lang="ts">
/** Surface with an optional heading; the heading labels the region. */
import { useId } from 'vue'

defineProps<{ title?: string }>()
const headingId = useId()
</script>

<template>
  <section
    class="rounded-card border border-line bg-surface p-5 shadow-card"
    :aria-labelledby="title || $slots.heading ? headingId : undefined"
  >
    <header v-if="title || $slots.heading" class="mb-2 flex items-center gap-3">
      <h2 :id="headingId" class="text-sm font-semibold tracking-wide">
        <slot name="heading">{{ title }}</slot>
      </h2>
      <div class="ml-auto"><slot name="aside" /></div>
    </header>
    <slot />
  </section>
</template>
