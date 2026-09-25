<script setup lang="ts">
import type { LibrarySummary } from '../../domain/library'
import { t } from '../../i18n'

defineProps<{ summary: LibrarySummary }>()
</script>

<template>
  <p class="text-sm text-muted" data-testid="library">{{ t('library_tracks', { count: summary.tracks }) }}</p>
</template>
