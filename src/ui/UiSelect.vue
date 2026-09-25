<script setup lang="ts" generic="T extends string">
/** Native select with a visually hidden label. */
const model = defineModel<T>({ required: true })
defineProps<{ label: string; options: readonly { value: T; text: string }[] }>()
</script>

<template>
  <label>
    <span class="sr-only">{{ label }}</span>
    <select
      v-model="model"
      :aria-label="label"
      class="rounded-xl border border-line bg-surface px-2 py-1 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
    >
      <option v-for="option in options" :key="option.value" :value="option.value">{{ option.text }}</option>
    </select>
  </label>
</template>
