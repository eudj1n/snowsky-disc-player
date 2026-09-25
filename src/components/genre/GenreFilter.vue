<script setup lang="ts">
/** Genre filter for Albums and Tracks: all genres or one literal genre name. */
const model = defineModel<string | null>({ required: true })
defineProps<{ label: string; allLabel: string; options: readonly string[] }>()
</script>

<template>
  <label class="inline-flex items-center gap-8 text-10 text-muted">
    <span>{{ label }}</span>
    <select
      :value="model ?? ''"
      :aria-label="label"
      class="max-w-200 rounded-20 border border-line bg-paper px-12 py-7 text-10 text-ink hover:border-secondary focus-visible:border-secondary"
      @change="model = ($event.target as HTMLSelectElement).value || null"
    >
      <option value="">{{ allLabel }}</option>
      <option v-for="option in options" :key="option" :value="option">{{ option }}</option>
    </select>
  </label>
</template>
