<script setup lang="ts">
/** Volume 0..120 (reference): dragging updates the number only, release sends
 * once; observed values do not move the slider while it has focus. The icon
 * mutes and unmutes (the store sends 0 and later restores the earlier level). */
import { computed, ref, watch } from 'vue'
import UiIcon from '../../ui/UiIcon.vue'

const props = defineProps<{
  volume: number | null
  disabled: boolean
  label: string
  title: string
  muteLabel: string
  unmuteLabel: string
}>()
const emit = defineEmits<{ change: [value: number]; mute: [] }>()
const focused = ref(false)
const shown = ref<number | null>(props.volume)
const muted = computed(() => props.volume === 0)
watch(
  () => props.volume,
  (value) => {
    if (!focused.value) shown.value = value
  },
)
</script>

<template>
  <div class="flex items-center gap-8">
    <button
      type="button"
      :aria-label="muted ? unmuteLabel : muteLabel"
      :title="muted ? unmuteLabel : muteLabel"
      :aria-pressed="muted"
      :disabled="disabled || volume === null"
      class="-ml-5 grid size-26 shrink-0 place-items-center rounded-full text-current transition-colors duration-150 hover:enabled:bg-hover hover:enabled:text-ink disabled:opacity-45"
      @click="emit('mute')"
    >
      <UiIcon :name="muted ? 'muted' : 'volume'" class="size-16" />
    </button>
    <input
      type="range"
      min="0"
      max="120"
      step="1"
      :value="shown ?? 0"
      :disabled="disabled"
      :aria-label="label"
      :title="title"
      class="seek-slider min-w-40"
      :style="{ '--seek-fill': `${((shown ?? 0) / 120) * 100}%` }"
      @focus="focused = true"
      @blur="((focused = false), (shown = volume))"
      @input="shown = Number(($event.target as HTMLInputElement).value)"
      @change="emit('change', Number(($event.target as HTMLInputElement).value))"
    />
    <output class="min-w-19 text-9">{{ shown ?? '—' }}</output>
  </div>
</template>
