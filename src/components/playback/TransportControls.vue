<script setup lang="ts">
/** Previous / play-pause / next. Emits intents only; the owner decides whether
 * and how to send them. The centre icon reflects the observed state. */
import type { PlaybackState, TransportAction } from '../../domain/playback'
import { t } from '../../i18n'
import UiIconButton from '../../ui/UiIconButton.vue'

defineProps<{ state: PlaybackState; disabled: boolean }>()
const emit = defineEmits<{ transport: [action: TransportAction] }>()
</script>

<template>
  <div class="flex items-center gap-3">
    <UiIconButton icon="previous" :label="t('previous')" :disabled="disabled" @click="emit('transport', 'previous')" />
    <UiIconButton
      :icon="state === 'playing' ? 'pause' : 'play'"
      :label="t('play_pause')"
      primary
      :disabled="disabled"
      data-testid="toggle"
      @click="emit('transport', 'toggle')"
    />
    <UiIconButton icon="next" :label="t('next')" :disabled="disabled" @click="emit('transport', 'next')" />
  </div>
</template>
