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
      class="rounded-20 border border-line px-15 py-8 text-10 text-muted hover:text-ink aria-pressed:border-secondary aria-pressed:bg-secondary aria-pressed:text-white dark:aria-pressed:border-[#bfcea9] dark:aria-pressed:bg-[#bfcea9] dark:aria-pressed:text-[#192214]"
      @click="model = option.value"
    >
      {{ option.text }}
    </button>
  </div>
</template>
