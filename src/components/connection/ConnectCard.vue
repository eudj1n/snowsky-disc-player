<script setup lang="ts">
/** Reference .connect-card: device glyph, player name, call to action, arrow. */
import UiIcon from '../../ui/UiIcon.vue'

defineProps<{ action: string }>()
const emit = defineEmits<{ open: [] }>()
</script>

<template>
  <button
    type="button"
    class="mx-auto mt-28 flex w-fit max-w-full items-center gap-14 rounded-14 border border-line bg-raised px-18 py-16 text-left text-ink hover:bg-hover focus-visible:outline-secondary"
    @click="emit('open')"
  >
    <UiIcon name="device" class="size-27 text-secondary" />
    <span>
      <strong class="block text-11 tracking-[0.5px]">SNOWSKY DISC</strong>
      <small class="mt-5 block text-12 text-secondary">{{ action }}</small>
    </span>
    <UiIcon name="arrow" class="ml-14 size-17 text-secondary" />
  </button>
</template>
