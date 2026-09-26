<script setup lang="ts" generic="T extends string">
/** A group of pressable chips (reference .chip); one value is active. */
const model = defineModel<T>({ required: true })
defineProps<{ label: string; options: readonly { value: T; text: string }[] }>()
</script>

<template>
  <div role="group" :aria-label="label" class="flex flex-wrap gap-6">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :aria-pressed="model === option.value"
      class="rounded-20 border border-line px-15 py-8 text-11 text-muted hover:text-ink aria-pressed:border-chip-on aria-pressed:bg-chip-on aria-pressed:text-chip-on-ink"
      @click="model = option.value"
    >
      {{ option.text }}
    </button>
  </div>
</template>
