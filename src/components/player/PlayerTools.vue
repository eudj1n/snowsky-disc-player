<script setup lang="ts">
/** Right block of the player bar: output label, observed volume, queue. */
import UiIcon from '../../ui/UiIcon.vue'
import UiIconButton from '../../ui/UiIconButton.vue'

defineProps<{
  outputLabel: string
  volume: number | null
  volumeLabel: string
  volumeTitle: string
  queueLabel: string
  queueExpanded: boolean
  queueDisabled: boolean
}>()
const emit = defineEmits<{ queue: [opener: HTMLElement] }>()
</script>

<template>
  <div class="flex items-center justify-end gap-10 text-muted compact:gap-7 rail:justify-center">
    <span class="mr-12 text-8 tracking-[1.2px] whitespace-nowrap compact:hidden">{{ outputLabel }}</span>
    <span class="rail:hidden"><UiIcon name="volume" class="size-16" /></span>
    <input
      type="range"
      min="0"
      max="120"
      :value="volume ?? 0"
      disabled
      :aria-label="volumeLabel"
      :title="volumeTitle"
      class="h-3 w-73 cursor-pointer accent-progress-fill compact:w-55 rail:hidden"
    />
    <output class="min-w-19 text-9 rail:hidden">{{ volume ?? '—' }}</output>
    <span class="mx-5 h-20 w-1 bg-line rail:hidden" />
    <UiIconButton
      icon="queue"
      :label="queueLabel"
      :disabled="queueDisabled"
      aria-controls="now-panel"
      :aria-expanded="queueExpanded"
      class="aria-expanded:bg-soft aria-expanded:text-accent"
      @click="emit('queue', $event.currentTarget as HTMLElement)"
    />
  </div>
</template>
