<script setup lang="ts">
/** Connection state and the identity of the connected player. */
import { computed } from 'vue'
import type { ConnectionState, PlayerIdentity } from '../../domain/player'
import { t } from '../../i18n'
import UiStatusDot from '../../ui/UiStatusDot.vue'

const props = defineProps<{ state: ConnectionState; identity: PlayerIdentity | null }>()
const tone = computed(() => (props.state === 'connected' ? 'ok' : props.state === 'connecting' ? 'busy' : 'idle'))
</script>

<template>
  <div>
    <p class="flex items-center gap-2 text-sm">
      <UiStatusDot :tone="tone" />
      <span data-testid="connection-state">{{ t(state) }}</span>
    </p>
    <p v-if="identity" class="mt-1 text-sm text-muted">
      {{ t('firmware') }} <span data-testid="firmware">{{ identity.firmware ?? '—' }}</span> ·
      <span data-testid="identity">{{ identity.handshake }}</span>
    </p>
  </div>
</template>
