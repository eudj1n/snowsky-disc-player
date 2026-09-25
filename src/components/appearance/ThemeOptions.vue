<script setup lang="ts">
/** Three appearance choices with miniature app swatches (reference theme dialog). */
import type { Appearance } from '../../domain/preferences'

defineProps<{ value: Appearance; labels: Record<Appearance, string> }>()
const emit = defineEmits<{ choose: [value: Appearance] }>()
const OPTIONS: { value: Appearance; swatch: string }[] = [
  { value: 'light', swatch: 'bg-[linear-gradient(90deg,#e6e9df_20%,#faf9f6_20%)]' },
  { value: 'dark', swatch: 'bg-[linear-gradient(90deg,#101410_20%,#22291f_20%)]' },
  { value: 'system', swatch: 'bg-[linear-gradient(115deg,#faf9f6_50%,#22291f_50%)]' },
]
</script>

<template>
  <div class="my-26 grid grid-cols-3 gap-12">
    <button
      v-for="option in OPTIONS"
      :key="option.value"
      type="button"
      :aria-pressed="value === option.value"
      class="rounded-12 border border-line p-9 text-11 text-muted aria-pressed:border-accent aria-pressed:bg-soft aria-pressed:text-ink dark:aria-pressed:bg-[#303d29]"
      @click="emit('choose', option.value)"
    >
      <span
        aria-hidden="true"
        class="relative mb-10 block aspect-[1.3] overflow-hidden rounded-6 border border-[#80808040] after:absolute after:top-[20%] after:left-[28%] after:h-[55%] after:w-[59%] after:rounded-4 after:bg-[#89977a60] after:shadow-[0_20px_0_-5px_#89977a30] after:content-['']"
        :class="option.swatch"
      />
      {{ labels[option.value] }}
    </button>
  </div>
</template>
