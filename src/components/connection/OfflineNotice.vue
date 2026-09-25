<script setup lang="ts">
/** Shown above a collection read from the saved copy while the player is unreachable. */
import UiIcon from '../../ui/UiIcon.vue'
import UiTextButton from '../../ui/UiTextButton.vue'

defineProps<{ text: string; retryLabel: string; busy: boolean }>()
const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <div
    role="status"
    class="mb-20 flex items-center gap-12 rounded-12 border border-line bg-banner px-16 py-12 text-11 leading-[1.5] text-banner-ink phone:items-start"
  >
    <UiIcon name="info" class="size-16 shrink-0" />
    <span class="min-w-0 flex-1">{{ text }}</span>
    <UiTextButton class="shrink-0 text-11" :disabled="busy" @click="emit('retry')">{{ retryLabel }}</UiTextButton>
  </div>
</template>
