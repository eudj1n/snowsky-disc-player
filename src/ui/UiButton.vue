<script setup lang="ts">
/** Text button. Variants only change appearance; behavior stays native. */
withDefaults(defineProps<{ variant?: 'primary' | 'secondary'; type?: 'button' | 'submit'; disabled?: boolean }>(), {
  variant: 'secondary',
  type: 'button',
  disabled: false,
})
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    class="inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral disabled:cursor-not-allowed disabled:opacity-45"
    :class="
      variant === 'primary'
        ? 'border-coral bg-coral text-coral-ink hover:enabled:brightness-105'
        : 'border-line bg-transparent text-ink hover:enabled:border-muted'
    "
  >
    <slot />
  </button>
</template>
