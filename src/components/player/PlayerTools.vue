<script setup lang="ts">
/** Right block of the player bar: output label, volume, queue. */
import UiIconButton from '../../ui/UiIconButton.vue'
import VolumeControl from './VolumeControl.vue'

defineProps<{
  outputLabel: string
  volume: number | null
  volumeDisabled: boolean
  volumeLabel: string
  volumeTitle: string
  muteLabel: string
  unmuteLabel: string
  queueLabel: string
  queueExpanded: boolean
  queueDisabled: boolean
}>()
const emit = defineEmits<{ queue: [opener: HTMLElement]; volume: [value: number]; mute: [] }>()
</script>

<template>
  <div class="flex items-center justify-end gap-10 text-muted compact:gap-7 rail:justify-center">
    <span class="mr-12 text-8 tracking-[1.2px] whitespace-nowrap compact:hidden">{{ outputLabel }}</span>
    <VolumeControl
      class="w-120 compact:w-100 rail:hidden"
      :volume="volume"
      :disabled="volumeDisabled"
      :label="volumeLabel"
      :title="volumeTitle"
      :mute-label="muteLabel"
      :unmute-label="unmuteLabel"
      @change="(value) => emit('volume', value)"
      @mute="emit('mute')"
    />
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
