<script setup lang="ts">
import LibrarySummary from '../components/library/LibrarySummary.vue'
import PlayerStatus from '../components/player/PlayerStatus.vue'
import { t } from '../i18n'
import { connect, connection, disconnect } from '../stores/connection'
import { library } from '../stores/library'
import UiButton from '../ui/UiButton.vue'
import UiCard from '../ui/UiCard.vue'
import UiNotice from '../ui/UiNotice.vue'
</script>

<template>
  <UiCard title="SNOWSKY DISC">
    <PlayerStatus :state="connection.connection" :identity="connection.identity" />
    <LibrarySummary v-if="library.summary" :summary="library.summary" class="mt-1" />
    <UiNotice v-if="connection.notice" data-testid="notice">{{ t(connection.notice) }}</UiNotice>
    <div class="mt-4 flex gap-3">
      <UiButton
        v-if="connection.connection !== 'connected'"
        variant="primary"
        :disabled="connection.connection === 'connecting' || connection.gateway === false"
        @click="connect"
      >
        {{ t('connect') }}
      </UiButton>
      <UiButton v-else @click="disconnect">{{ t('disconnect') }}</UiButton>
    </div>
  </UiCard>
</template>
