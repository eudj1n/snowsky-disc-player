<script setup lang="ts">
/** Single-line input with a visually hidden label. */
const model = defineModel<string>({ required: true })
withDefaults(defineProps<{ label: string; type?: 'text' | 'password'; invalid?: boolean }>(), {
  type: 'text',
  invalid: false,
})
</script>

<template>
  <label class="block">
    <span class="sr-only">{{ label }}</span>
    <input
      v-model="model"
      :type="type"
      :placeholder="label"
      :aria-invalid="invalid"
      autocomplete="off"
      spellcheck="false"
      class="w-full rounded-xl border bg-surface px-3 py-2 text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
      :class="invalid ? 'border-warn' : 'border-line'"
    />
  </label>
</template>
