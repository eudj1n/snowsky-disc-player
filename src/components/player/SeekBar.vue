<script setup lang="ts">
/**
 * Timeline with the reference seek interaction (app.js captureSeek/updateSeek):
 * pressing captures the displayed track; dragging only previews; release
 * sends one seek with the captured identity; a press without movement, a
 * cancelled pointer or blur discards the draft. Ticks never move the thumb
 * while a draft exists.
 */
import { computed, ref } from 'vue'
import { timeLabel } from '../../domain/track'

const props = defineProps<{
  positionMs: number | null
  durationMs: number | null
  identity: string | null
  disabled: boolean
  label: string
  /** Hide the time labels (mobile mini-player). */
  compact?: boolean
}>()
const emit = defineEmits<{ seek: [seconds: number, identity: string] }>()

const draft = ref<{ identity: string; seconds: number; moved: boolean } | null>(null)
const max = computed(() =>
  props.durationMs && props.durationMs >= 1000 ? Math.ceil(props.durationMs / 1000) - 1 : 100,
)
const seconds = computed(() =>
  draft.value ? draft.value.seconds : Math.min(max.value, Math.max(0, Math.floor((props.positionMs ?? 0) / 1000))),
)
const fill = computed(() => `${max.value ? (100 * seconds.value) / max.value : 0}%`)
const shown = computed(() => (draft.value ? timeLabel(draft.value.seconds * 1000) : timeLabel(props.positionMs)))

function capture(): void {
  if (props.disabled || !props.identity || draft.value) return
  draft.value = { identity: props.identity, seconds: seconds.value, moved: false }
}
function preview(event: Event): void {
  capture()
  if (!draft.value) return
  draft.value.moved = true
  draft.value.seconds = Number((event.target as HTMLInputElement).value)
}
function commit(event: Event): void {
  const current = draft.value
  draft.value = null
  if (!current) return
  emit('seek', Number((event.target as HTMLInputElement).value), current.identity)
}
function release(): void {
  if (draft.value && !draft.value.moved) draft.value = null
}
function discard(): void {
  draft.value = null
}
</script>

<template>
  <div class="flex items-center gap-10 text-caption2 text-muted tabular-nums">
    <span v-if="!compact" class="whitespace-nowrap">{{ shown }}</span>
    <input
      class="seek-slider"
      type="range"
      min="0"
      :max="max"
      step="1"
      :value="seconds"
      :disabled="disabled"
      :aria-label="label"
      :aria-valuetext="`${shown} / ${timeLabel(durationMs)}`"
      :style="{ '--seek-fill': fill }"
      @pointerdown="capture"
      @input="preview"
      @change="commit"
      @pointerup="release"
      @pointercancel="discard"
      @blur="discard"
    />
    <span v-if="!compact" class="whitespace-nowrap">{{ timeLabel(durationMs) }}</span>
  </div>
</template>
