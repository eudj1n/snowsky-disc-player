<script setup lang="ts">
/** Title, credits and optional duration/format of one track. Device metadata is shown as is. */
import { computed } from 'vue'
import { formatBadge, formatDuration, trackCredits, type Track } from '../../domain/track'

const props = defineProps<{ track: Track; showDetails?: boolean }>()
const credits = computed(() => trackCredits(props.track))
const duration = computed(() => formatDuration(props.track.durationMs))
const badge = computed(() => formatBadge(props.track.path))
</script>

<template>
  <div class="min-w-0">
    <p class="truncate text-lg font-semibold" data-testid="track-title">{{ track.title }}</p>
    <p v-if="credits" class="truncate text-sm text-muted">{{ credits }}</p>
    <p v-if="showDetails && (duration || badge)" class="mt-1 flex gap-2 text-xs text-muted">
      <span v-if="badge" class="rounded border border-line px-1.5 font-medium">{{ badge }}</span>
      <span v-if="duration">{{ duration }}</span>
    </p>
  </div>
</template>
