<script setup lang="ts">
/** The text size steps as a row of samples, each drawn at its own body size; the pressed one is in use. */
import { TEXT_SIZE_SAMPLE, TEXT_SIZES, type TextSize } from '../../domain/preferences'

defineProps<{ label: string; value: TextSize; names: Record<TextSize, string> }>()
const emit = defineEmits<{ choose: [value: TextSize] }>()
</script>

<template>
  <div role="group" :aria-label="label" class="grid grid-cols-4 gap-8 phone:grid-cols-2">
    <button
      v-for="size in TEXT_SIZES"
      :key="size"
      type="button"
      :aria-pressed="value === size"
      class="flex flex-col items-center justify-end gap-6 rounded-10 border border-line px-6 pt-10 pb-8 text-caption text-muted aria-pressed:border-accent aria-pressed:text-ink"
      @click="emit('choose', size)"
    >
      <span
        aria-hidden="true"
        class="leading-none font-semibold text-ink"
        :style="{ fontSize: `${TEXT_SIZE_SAMPLE[size] + 6}px` }"
        >Aa</span
      >
      {{ names[size] }}
    </button>
  </div>
</template>
