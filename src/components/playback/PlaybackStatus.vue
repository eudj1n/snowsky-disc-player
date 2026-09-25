<script setup lang="ts">
import type { PlaybackState } from '../../domain/playback'
import { t } from '../../i18n'

defineProps<{ state: PlaybackState }>()
</script>

<template>
  <p class="text-sm text-muted" data-testid="playback-state">{{ t(`state_${state}`) }}</p>
</template>
