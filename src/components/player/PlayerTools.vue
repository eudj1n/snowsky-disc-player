<script setup lang="ts">
/**
 * Right block of the player bar: where music plays (the player or this
 * browser, one switch; owner, 2026-09-30), the visualizer while this browser
 * plays, volume with the player's sound settings beside it (2026-09-30),
 * lyrics and queue.
 */
import UiIconButton from '../../ui/UiIconButton.vue'
import VolumeControl from './VolumeControl.vue'

defineProps<{
  side: 'disc' | 'browser'
  sideLabel: string
  switching: boolean
  visualizerLabel: string
  volume: number | null
  volumeDisabled: boolean
  volumeLabel: string
  volumeTitle: string
  soundLabel: string
  muteLabel: string
  unmuteLabel: string
  queueLabel: string
  queueExpanded: boolean
  lyricsLabel: string
  lyricsExpanded: boolean
  queueDisabled: boolean
}>()
const emit = defineEmits<{
  side: []
  visualizer: []
  queue: [opener: HTMLElement]
  lyrics: [opener: HTMLElement]
  volume: [value: number]
  mute: []
  sound: []
}>()
</script>

<template>
  <div class="flex items-center justify-end gap-10 text-muted compact:gap-7 rail:justify-center phone:gap-2">
    <UiIconButton
      :icon="side === 'disc' ? 'device' : 'browser'"
      :label="sideLabel"
      :disabled="switching"
      :pressed="side === 'browser'"
      class="phone:hidden"
      data-testid="side-switch"
      :data-side="side"
      @click="emit('side')"
    />
    <UiIconButton
      v-if="side === 'browser'"
      icon="visualizer"
      :label="visualizerLabel"
      class="phone:hidden"
      data-testid="visualizer-open"
      @click="emit('visualizer')"
    />
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
    <!-- The player's gain, filter and equalizer: disabled while this browser plays, which has none of them. -->
    <UiIconButton
      icon="sliders"
      :label="soundLabel"
      :disabled="side === 'browser'"
      class="-ml-4 rail:hidden"
      data-testid="sound-open"
      @click="emit('sound')"
    />
    <span class="mx-5 h-20 w-1 bg-line rail:hidden" />
    <UiIconButton
      icon="lyrics"
      :label="lyricsLabel"
      :disabled="queueDisabled"
      aria-controls="now-panel"
      :aria-expanded="lyricsExpanded"
      class="aria-expanded:bg-soft aria-expanded:text-accent"
      @click="emit('lyrics', $event.currentTarget as HTMLElement)"
    />
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
