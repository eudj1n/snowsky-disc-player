<script setup lang="ts">
import PlaybackStatus from '../components/playback/PlaybackStatus.vue'
import TransportControls from '../components/playback/TransportControls.vue'
import TrackArtwork from '../components/track/TrackArtwork.vue'
import TrackSummary from '../components/track/TrackSummary.vue'
import { t } from '../i18n'
import { connection } from '../stores/connection'
import { canControl, playback, refreshPlayback, transport } from '../stores/playback'
import UiCard from '../ui/UiCard.vue'
import UiIconButton from '../ui/UiIconButton.vue'
import UiNotice from '../ui/UiNotice.vue'
</script>

<template>
  <UiCard :title="t('now_playing')">
    <template #aside>
      <UiIconButton
        icon="refresh"
        :label="t('refresh')"
        :disabled="connection.connection !== 'connected' || playback.busy"
        @click="refreshPlayback"
      />
    </template>
    <div class="flex items-center gap-4">
      <TrackArtwork :title="playback.current.track?.title ?? null" />
      <TrackSummary v-if="playback.current.track" :track="playback.current.track" show-details />
      <p v-else class="text-muted" data-testid="track-title">{{ t('nothing_observed') }}</p>
    </div>
    <PlaybackStatus :state="playback.current.state" class="mt-3" />
    <UiNotice v-if="playback.uncertain">{{ t('outcome_uncertain') }}</UiNotice>
    <TransportControls class="mt-4" :state="playback.current.state" :disabled="!canControl" @transport="transport" />
  </UiCard>
</template>
