<script setup lang="ts">
/** The interface languages, each named in itself; the pressed one is in use. */
defineProps<{ label: string; value: string; options: readonly { value: string; name: string }[] }>()
const emit = defineEmits<{ choose: [value: string] }>()
</script>

<template>
  <div role="group" :aria-label="label" class="grid grid-cols-2 gap-8">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :lang="option.value"
      :aria-pressed="value === option.value"
      class="rounded-10 border border-line px-10 py-10 text-footnote text-muted aria-pressed:border-accent aria-pressed:text-ink"
      @click="emit('choose', option.value)"
    >
      {{ option.name }}
    </button>
  </div>
</template>
