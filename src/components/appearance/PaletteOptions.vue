<script setup lang="ts" generic="T extends string">
/** One row of palette swatches for a theme; the pressed one is in use. */
import { SWATCHES, type Swatch } from '../../domain/palettes'

defineProps<{ label: string; options: readonly T[]; value: T; names: Record<T, string> }>()
const emit = defineEmits<{ choose: [value: T] }>()
const swatch = (id: string): Swatch => SWATCHES[id as keyof typeof SWATCHES]
</script>

<template>
  <div role="group" :aria-label="label" class="grid grid-cols-4 gap-8 phone:grid-cols-2">
    <button
      v-for="option in options"
      :key="option"
      type="button"
      :aria-pressed="value === option"
      class="rounded-10 border border-line p-6 text-10 text-muted aria-pressed:border-accent aria-pressed:text-ink"
      @click="emit('choose', option)"
    >
      <span
        aria-hidden="true"
        class="relative mb-6 block aspect-[1.4] overflow-hidden rounded-5 border border-[#80808040]"
        :style="{
          background: `linear-gradient(90deg, ${swatch(option).surface} 24%, ${swatch(option).paper} 24%)`,
        }"
      >
        <span
          class="absolute bottom-[18%] left-[34%] h-[16%] w-[44%] rounded-full"
          :style="{ background: swatch(option).strong }"
        />
      </span>
      {{ names[option] }}
    </button>
  </div>
</template>
