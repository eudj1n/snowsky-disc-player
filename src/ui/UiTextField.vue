<script setup lang="ts">
/**
 * Single-line input with a visually hidden label. The `search` variant is the
 * top bar's search pill, a size smaller (owner, 2026-10-21): a search icon
 * leading, round, on the soft background.
 */
import UiIcon from './UiIcon.vue'

const model = defineModel<string>({ required: true })
withDefaults(
  defineProps<{ label: string; type?: 'text' | 'password'; invalid?: boolean; variant?: 'field' | 'search' }>(),
  { type: 'text', invalid: false, variant: 'field' },
)
</script>

<template>
  <label class="relative block">
    <span class="sr-only">{{ label }}</span>
    <UiIcon
      v-if="variant === 'search'"
      name="search"
      aria-hidden="true"
      class="pointer-events-none absolute top-1/2 left-12 size-15 -translate-y-1/2 text-muted"
    />
    <input
      v-model="model"
      :type="variant === 'search' ? 'search' : type"
      :placeholder="label"
      :aria-invalid="invalid"
      autocomplete="off"
      spellcheck="false"
      class="w-full text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      :class="
        variant === 'search'
          ? 'rounded-full bg-soft py-7 pr-14 pl-34 text-footnote transition-colors duration-150 hover:bg-hover [&::-webkit-search-cancel-button]:appearance-none'
          : ['rounded-xl border bg-surface px-3 py-2', invalid ? 'border-warn' : 'border-line']
      "
    />
  </label>
</template>
