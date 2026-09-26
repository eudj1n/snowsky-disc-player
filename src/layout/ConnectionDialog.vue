<script setup lang="ts">
/**
 * Reference connection dialog, adapted: the page is served by the player,
 * so there is no address form. Connect/Disconnect, identity, the one-owner
 * note and pairing with the card token. Opening never connects.
 */
import { computed } from 'vue'
import ConnectionStatus from '../components/connection/ConnectionStatus.vue'
import PairingForm from '../components/connection/PairingForm.vue'
import { t } from '../i18n'
import { connect, connection, disconnect } from '../stores/connection'
import { forgetToken, pairing, saveToken } from '../stores/pairing'
import { closeDialog, ui } from '../stores/ui'
import UiDialog from '../ui/UiDialog.vue'
import UiPillButton from '../ui/UiPillButton.vue'
import UiTextButton from '../ui/UiTextButton.vue'

const status = computed(() => {
  if (connection.gateway === false) return t('server_unavailable')
  const base = t(connection.connection)
  const identity = connection.identity
  return identity ? `${base} · ${t('firmware')} ${identity.firmware ?? '—'} · ${identity.handshake}` : base
})
</script>

<template>
  <UiDialog
    :open="ui.dialog === 'connection'"
    :eyebrow="t('your_player')"
    :close-label="t('close')"
    wide
    @close="closeDialog"
  >
    <div class="my-22 flex items-center gap-22 narrow:gap-16">
      <span
        aria-hidden="true"
        class="relative size-76 shrink-0 rounded-full border border-[var(--art-edge)] bg-[repeating-radial-gradient(circle,var(--art-a)_0_2px,var(--art-b)_3px_6px)] shadow-[0_10px_25px_#55673820] after:absolute after:top-1/2 after:left-1/2 after:size-26 after:-translate-1/2 after:rounded-full after:border-5 after:border-[var(--art-edge-2)] after:bg-paper"
      />
      <div>
        <h2 class="narrow:text-23 mt-0 mb-8 text-27 font-bold tracking-[-1px]">{{ t('connection_title') }}</h2>
        <p class="m-0 text-12 leading-[1.7] text-muted">{{ t('connection_intro') }}</p>
      </div>
    </div>
    <ConnectionStatus :text="status" :connected="connection.connection === 'connected'" />
    <p v-if="connection.notice" role="status" class="-mt-8 mb-16 text-12 text-accent" data-testid="notice">
      {{ t(connection.notice) }}
    </p>
    <div class="flex items-center justify-between gap-14">
      <UiTextButton v-if="connection.connection === 'connected'" class="text-12" @click="disconnect">{{
        t('disconnect')
      }}</UiTextButton>
      <UiPillButton
        v-else
        class="ml-auto px-22 py-12 text-13"
        :disabled="connection.connection === 'connecting' || connection.gateway === false"
        @click="connect"
      >
        {{ t('connect') }}
      </UiPillButton>
    </div>
    <PairingForm :stored="pairing.stored" :serial="connection.snPairing" @save="saveToken" @forget="forgetToken" />
    <p class="mt-23 text-11 leading-[1.7] text-muted">{{ t('one_control_connection') }}</p>
  </UiDialog>
</template>
