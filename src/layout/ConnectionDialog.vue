<script setup lang="ts">
/**
 * Reference connection dialog, adapted: the page is served by the player,
 * so there is no address form. Connect/Disconnect, identity, the one-owner
 * note, pairing with the player's serial number, and the service's
 * diagnostics (combined-008) behind a disclosure. Opening never connects.
 */
import { computed, watch } from 'vue'
import ConnectionStatus from '../components/connection/ConnectionStatus.vue'
import PairingForm from '../components/connection/PairingForm.vue'
import { cardSpace, formatBytes } from '../domain/device'
import { locale, t, type MessageKey } from '../i18n'
import { about, loadAbout } from '../stores/about'
import { connect, connection, disconnect } from '../stores/connection'
import { device, refreshDevice } from '../stores/device'
import { albums, library, refreshPlayerFacts, refreshSummary, tracks } from '../stores/library'
import { playerOptions } from '../stores/playerOptions'
import { forgetToken, pairing, saveToken } from '../stores/pairing'
import { closeDialog, ui } from '../stores/ui'
import UiDialog from '../ui/UiDialog.vue'
import UiPillButton from '../ui/UiPillButton.vue'
import UiTextButton from '../ui/UiTextButton.vue'

/**
 * Collection size, battery and card space for the player card (owner, rounds
 * 13 and 14). The battery is the live gauge where the service reads it, else
 * the charge stock last stored.
 */
const battery = computed(() => device.facts?.battery?.capacity ?? playerOptions.battery)
const facts = computed(() =>
  [
    library.status === 'ready' ? { key: 'albums', label: t('stat_albums'), value: String(albums.value.length) } : null,
    // The summary counts every track (a very large library is cut); without it, the tracks loaded.
    library.summary || library.status === 'ready'
      ? { key: 'tracks', label: t('stat_tracks'), value: String(library.summary?.tracks ?? tracks.value.length) }
      : null,
    battery.value !== null ? { key: 'battery', label: t('stat_battery'), value: `${String(battery.value)}%` } : null,
  ].filter((fact) => fact !== null),
)
/** The card as a full-width bar of the used space, colored by what is left (owner, round 15). */
const card = computed(() => {
  const space = device.facts?.card
  const shares = space ? cardSpace(space) : null
  if (!space || !shares) return null
  return {
    text: t('card_free', {
      free: formatBytes(space.freeBytes, locale.value),
      total: formatBytes(space.totalBytes, locale.value),
    }),
    percent: Math.round(shares.used * 100),
    level: shares.level,
  }
})
const LEVEL_FILL = { ok: 'bg-progress-fill', low: 'bg-[var(--caution)]', critical: 'bg-accent' } as const
watch(
  () => ui.dialog === 'connection',
  (open) => {
    if (open && connection.gateway !== false) {
      void refreshPlayerFacts()
      void refreshDevice()
      if (!library.summary) void refreshSummary()
    }
  },
)

/** Diagnostics: read when the disclosure opens. */
function onDiagnostics(event: Event): void {
  if ((event.target as HTMLDetailsElement).open) void loadAbout()
}
const database = computed(() => {
  const value = about.about?.database
  if (!value) return null
  const count = (n: number | null) => (n === null ? '—' : String(n))
  return t('about_database_facts', {
    state: value.state,
    schema: count(value.schema),
    plays: count(value.plays),
    records: count(value.records),
    trash: count(value.trash),
  })
})
/** The service's reasons for a play it could not write (combined-009), as the page words them. */
const WRITE_REASONS: Record<string, MessageKey> = {
  'card full': 'about_writes_card_full',
  'card away': 'about_writes_card_away',
  'newer schema': 'about_writes_newer',
  'input/output': 'about_writes_io',
}
const writes = computed(() => {
  const value = about.about?.database?.writes
  if (!value) return null
  if (!value.failed) return { text: t('about_writes_ok'), failing: false }
  const reason = t((value.reason && WRITE_REASONS[value.reason]) || 'about_writes_other')
  return { text: t('about_writes_failed', { count: value.failed, reason }), failing: true }
})
const PAGE_SOURCE = { card: 'about_page_card', image: 'about_page_image', embedded: 'about_page_embedded' } as const

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
    <dl v-if="facts.length || card" class="-mt-4 mb-18 grid grid-cols-3 gap-10" data-testid="player-facts">
      <div v-for="fact in facts" :key="fact.key" class="rounded-10 bg-soft px-14 py-10">
        <dt class="text-10 tracking-[1px] text-muted uppercase">{{ fact.label }}</dt>
        <dd class="m-0 mt-2 text-17 font-semibold">{{ fact.value }}</dd>
      </div>
      <div v-if="card" class="col-span-3 rounded-10 bg-soft px-14 py-10" data-testid="card-space">
        <div class="flex items-baseline justify-between gap-12">
          <dt class="text-10 tracking-[1px] text-muted uppercase">{{ t('stat_card') }}</dt>
          <dd class="m-0 text-13 font-semibold">{{ card.text }}</dd>
        </div>
        <dd class="m-0 mt-8">
          <div
            role="meter"
            :aria-label="t('card_used')"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="card.percent"
            :aria-valuetext="card.text"
            :data-level="card.level"
            class="h-6 overflow-hidden rounded-full bg-progress-bg"
          >
            <div class="h-full rounded-full" :class="LEVEL_FILL[card.level]" :style="{ width: `${card.percent}%` }" />
          </div>
          <RouterLink
            to="/card"
            class="mt-8 inline-block text-11 text-muted hover:text-ink hover:underline"
            @click="closeDialog"
            >{{ t('card_details') }} →</RouterLink
          >
        </dd>
      </div>
    </dl>
    <p v-if="connection.notice" role="status" class="-mt-8 mb-16 text-12 text-notice" data-testid="notice">
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
    <PairingForm :stored="pairing.stored" @save="saveToken" @forget="forgetToken" />
    <p class="mt-23 text-11 leading-[1.7] text-muted">{{ t('one_control_connection') }}</p>
    <details class="mt-16 border-t border-line pt-14 text-12" data-testid="diagnostics" @toggle="onDiagnostics">
      <summary class="cursor-pointer text-13 font-medium">{{ t('about_title') }}</summary>
      <p v-if="!about.about" class="mt-10 text-muted">{{ about.loading ? '…' : t('about_unavailable') }}</p>
      <dl v-else class="mt-10 grid grid-cols-[auto_1fr] gap-x-14 gap-y-6">
        <dt class="text-muted">{{ t('about_service') }}</dt>
        <dd class="m-0">{{ about.about.version }} · {{ t('about_build', { build: about.about.build }) }}</dd>
        <template v-if="about.about.image">
          <dt class="text-muted">{{ t('about_image') }}</dt>
          <dd class="m-0">{{ [about.about.image.variant, about.about.image.firmware].filter(Boolean).join(' · ') }}</dd>
        </template>
        <dt class="text-muted">{{ t('about_page') }}</dt>
        <dd class="m-0">
          {{ [t(PAGE_SOURCE[about.about.page.source]), about.about.page.version].filter(Boolean).join(' · ') }}
        </dd>
        <template v-if="database">
          <dt class="text-muted">{{ t('about_database') }}</dt>
          <dd class="m-0">{{ database }}</dd>
        </template>
        <template v-if="writes">
          <dt class="text-muted">{{ t('about_writes') }}</dt>
          <dd class="m-0" :class="{ 'text-notice': writes.failing }" data-testid="about-writes">{{ writes.text }}</dd>
        </template>
        <dt class="text-muted">{{ t('about_restarts') }}</dt>
        <dd class="m-0">
          <template v-if="!about.about.restarts.length">{{ t('about_none') }}</template>
          <span v-for="line in about.about.restarts" :key="line" class="block font-mono text-11">{{ line }}</span>
        </dd>
        <dt class="text-muted">{{ t('about_messages') }}</dt>
        <dd class="m-0 max-h-160 overflow-auto">
          <template v-if="!about.about.log.length">{{ t('about_none') }}</template>
          <span v-for="(entry, index) in about.about.log" :key="index" class="block font-mono text-11">{{
            entry.message
          }}</span>
        </dd>
      </dl>
    </details>
  </UiDialog>
</template>
