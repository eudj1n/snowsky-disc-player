<script setup lang="ts">
/**
 * Centre of the player bar: shuffle, previous, play/pause, next, repeat and
 * the timeline. Emits intents; the owner decides what is sent.
 */
import { computed } from 'vue'
import type { PlaybackState, TransportAction } from '../../domain/playback'
import UiIcon from '../../ui/UiIcon.vue'
import UiIconButton from '../../ui/UiIconButton.vue'
import SeekBar from './SeekBar.vue'

const props = defineProps<{
  state: PlaybackState
  positionMs: number | null
  durationMs: number | null
  identity: string | null
  controlsDisabled: boolean
  modesDisabled: boolean
  seekDisabled: boolean
  shuffle: boolean
  repeat: boolean
  labels: { shuffle: string; previous: string; play: string; pause: string; next: string; repeat: string; seek: string }
}>()
const emit = defineEmits<{
  transport: [action: TransportAction]
  mode: [kind: 'shuffle' | 'repeat']
  seek: [seconds: number, identity: string]
}>()
const playing = computed(() => props.state === 'playing')
const small = 'size-25 p-3 [&>svg]:size-19'
</script>

<template>
  <div class="min-w-0">
    <div class="mb-10 flex items-center justify-center gap-15 phone:m-0 phone:gap-12">
      <UiIconButton
        icon="shuffle"
        :label="labels.shuffle"
        :pressed="shuffle"
        :disabled="modesDisabled"
        :class="small"
        class="phone:hidden"
        @click="emit('mode', 'shuffle')"
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
        <UiIcon filled :name="playing ? 'pause' : 'play'" class="size-15 stroke-[1.5]" />
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
        :pressed="repeat"
        :disabled="modesDisabled"
        :class="small"
        class="phone:hidden"
        @click="emit('mode', 'repeat')"
      />
    </div>
    <SeekBar
      class="phone:absolute phone:inset-x-0 phone:bottom-0 phone:gap-0"
      :position-ms="positionMs"
      :duration-ms="durationMs"
      :identity="identity"
      :disabled="seekDisabled"
      :label="labels.seek"
      @seek="(seconds, id) => emit('seek', seconds, id)"
    />
  </div>
</template>
