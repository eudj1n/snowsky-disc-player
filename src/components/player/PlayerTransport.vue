<script setup lang="ts">
/**
 * Centre of the player bar: shuffle, previous, play/pause, next, repeat and
 * the timeline. Emits intents; the owner decides what is sent.
 */
import { computed } from 'vue'
import type { PlaybackState, TransportAction } from '../../domain/playback'
import { timeLabel } from '../../domain/track'
import UiIcon from '../../ui/UiIcon.vue'
import UiIconButton from '../../ui/UiIconButton.vue'

const props = defineProps<{
  state: PlaybackState
  durationMs: number | null
  controlsDisabled: boolean
  modeDisabled: boolean
  labels: { shuffle: string; previous: string; play: string; pause: string; next: string; repeat: string; seek: string }
}>()
const emit = defineEmits<{ transport: [action: TransportAction] }>()
const playing = computed(() => props.state === 'playing')
const small = 'size-25 p-3 [&>svg]:size-19'
</script>

<template>
  <div class="min-w-0">
    <div class="mb-10 flex items-center justify-center gap-15 phone:m-0 phone:gap-12">
      <UiIconButton
        icon="shuffle"
        :label="labels.shuffle"
        :pressed="false"
        disabled
        :class="small"
        class="phone:hidden"
      />
      <UiIconButton
        icon="previous"
        :label="labels.previous"
        :disabled="controlsDisabled"
        :class="small"
        class="text-ink phone:hidden"
        @click="emit('transport', 'previous')"
      />
      <button
        type="button"
        data-testid="toggle"
        :aria-label="playing ? labels.pause : labels.play"
        :title="playing ? labels.pause : labels.play"
        :disabled="controlsDisabled"
        class="flex size-34 items-center justify-center rounded-full bg-[#30362b] text-white hover:enabled:scale-[1.07] hover:enabled:bg-[#3b4335] dark:bg-[#d8e1cc] dark:text-[#1b2316] dark:hover:enabled:bg-[#e4ebd9] phone:size-31"
        @click="emit('transport', 'toggle')"
      >
        <UiIcon :name="playing ? 'pause' : 'play'" class="size-15 fill-current stroke-[1.5]" />
      </button>
      <UiIconButton
        icon="next"
        :label="labels.next"
        :disabled="controlsDisabled"
        :class="small"
        class="text-ink phone:w-23"
        @click="emit('transport', 'next')"
      />
      <UiIconButton
        icon="repeat"
        :label="labels.repeat"
        :pressed="false"
        disabled
        :class="small"
        class="phone:hidden"
      />
    </div>
    <div
      class="flex items-center gap-10 text-8 text-muted tabular-nums phone:absolute phone:inset-x-0 phone:bottom-0 phone:gap-0"
    >
      <span class="whitespace-nowrap phone:hidden">—:—</span>
      <input class="seek-slider" type="range" min="0" max="100" value="0" disabled :aria-label="labels.seek" />
      <span class="whitespace-nowrap phone:hidden">{{ timeLabel(durationMs) }}</span>
    </div>
  </div>
</template>
