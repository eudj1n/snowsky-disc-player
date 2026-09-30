<script setup lang="ts">
/** Three appearance choices with miniature app swatches in the chosen palettes (reference theme dialog). */
import { computed } from 'vue'
import type { Swatch } from '../../domain/palettes'
import type { Appearance } from '../../domain/preferences'

const props = defineProps<{ value: Appearance; labels: Record<Appearance, string>; light: Swatch; dark: Swatch }>()
const emit = defineEmits<{ choose: [value: Appearance] }>()
const OPTIONS = computed<{ value: Appearance; swatch: string }[]>(() => [
  { value: 'light', swatch: `linear-gradient(90deg, ${props.light.surface} 20%, ${props.light.paper} 20%)` },
  { value: 'dark', swatch: `linear-gradient(90deg, ${props.dark.surface} 20%, ${props.dark.paper} 20%)` },
  { value: 'system', swatch: `linear-gradient(115deg, ${props.light.paper} 50%, ${props.dark.paper} 50%)` },
])
</script>

<template>
  <div class="my-26 grid grid-cols-3 gap-12">
    <button
      v-for="option in OPTIONS"
      :key="option.value"
      type="button"
      :aria-pressed="value === option.value"
      class="rounded-12 border border-line p-9 text-footnote text-muted aria-pressed:border-accent aria-pressed:bg-soft aria-pressed:text-ink dark:aria-pressed:bg-selected"
      @click="emit('choose', option.value)"
    >
      <span
        aria-hidden="true"
        class="relative mb-10 block aspect-[1.3] overflow-hidden rounded-6 border border-[#80808040] after:absolute after:top-[20%] after:left-[28%] after:h-[55%] after:w-[59%] after:rounded-4 after:bg-[#8a8a8a55] after:shadow-[0_20px_0_-5px_#8a8a8a30] after:content-['']"
        :style="{ background: option.swatch }"
      />
      {{ labels[option.value] }}
    </button>
  </div>
</template>
