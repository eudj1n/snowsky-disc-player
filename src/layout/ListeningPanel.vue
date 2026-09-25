<script setup lang="ts">
/**
 * Reference listening panel (aside#now-panel): non-modal, Now Playing and
 * Queue under one header, each section scrolling on its own. It reserves
 * 380px from 1200px (App.vue sets .listening-open), overlays below and fills
 * the width on phones. Opening focuses the minimize button; explicit closes
 * return focus to the opener; Escape closes it only when no dialog is open.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import NowPlayingDetails from '../components/player/NowPlayingDetails.vue'
import QueueRows from '../components/player/QueueRows.vue'
import type { TransportAction } from '../domain/playback'
import { t } from '../i18n'
import { connection } from '../stores/connection'
import { pairing } from '../stores/pairing'
import { playback, transport } from '../stores/playback'
import { loadQueue, queue } from '../stores/queue'
import { selection } from '../stores/selection'
import { closePanel, showPanelSection, toast, ui } from '../stores/ui'
import UiIconButton from '../ui/UiIconButton.vue'

const close = ref<InstanceType<typeof UiIconButton> | null>(null)
const items = computed(() => queue.items.map((row) => ({ title: row.name, artist: row.author })))
const status = computed(() =>
  connection.connection === 'connected' ? t(`playback_${playback.current.state}`) : t('disconnected'),
)
const controlsDisabled = computed(
  () =>
    connection.connection !== 'connected' ||
    connection.identity?.compatible !== true ||
    playback.busy ||
    selection.busy ||
    !playback.current.track,
)
const labels = computed(() => ({
  title: t('your_music_awaits'),
  shuffle: t('shuffle'),
  previous: t('previous_track'),
  play: t('play'),
  pause: t('pause'),
  next: t('next_track'),
  repeat: t('repeat_queue'),
  favorite: t('favorite_the_current_track'),
  seek: t('seek_position'),
  volume: t('player_volume'),
  output: t('audio_plays_on_your_disc'),
  format: t('format_from_filename'),
}))
const queueHint = computed(() => {
  if (queue.status === 'loading') return t('reading_the_queue')
  if (queue.status === 'failed') return t('queue_unavailable')
  if (queue.status === 'ready') return t('track_count', { count: queue.items.length })
  return ''
})

async function onTransport(action: TransportAction): Promise<void> {
  if (!pairing.paired) {
    toast('pair_to_control')
    return
  }
  await transport(action)
  if (playback.uncertain) toast('result_unconfirmed_the_command_was_not_retried', true)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && ui.panel && !document.querySelector('dialog[open]')) closePanel(true)
}

function onNavigate(): void {
  // Below 1200px the panel covers the page: close it before navigating.
  if (matchMedia('(max-width: 1199px)').matches) closePanel(false)
}

watch(
  () => ui.panel,
  async (section, previous) => {
    if (section && !previous) {
      if (connection.connection === 'connected') void loadQueue()
      await nextTick()
      ;(close.value?.$el as HTMLElement | undefined)?.focus({ preventScroll: true })
    }
  },
)
watch(
  () => connection.connection,
  (state) => state === 'disconnected' && ui.panel && closePanel(false),
)
onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <aside
    v-if="ui.panel"
    id="now-panel"
    :aria-label="t('player_view')"
    class="fixed top-0 right-0 bottom-(--player) z-25 flex w-380 animate-listening-enter flex-col border-l border-line bg-raised text-left shadow-[-15px_0_65px_#26301418] phone:w-full phone:border-l-0"
  >
    <div class="flex items-center justify-between px-24 pt-22 pb-12 phone:px-24 phone:pt-16 phone:pb-10">
      <span class="text-9 font-[650] tracking-[1.8px] text-muted uppercase">SNOWSKY DISC</span>
      <UiIconButton ref="close" icon="close" :label="t('minimize_player')" @click="closePanel(true)" />
    </div>
    <div class="mx-24 mb-20 flex shrink-0 gap-4 rounded-24 border border-line p-4 phone:mb-16" role="group">
      <button
        v-for="section in ['now', 'queue'] as const"
        :key="section"
        type="button"
        :aria-pressed="ui.panel === section"
        class="flex-1 rounded-20 px-12 py-9 text-12 text-muted aria-pressed:bg-paper aria-pressed:text-ink aria-pressed:shadow-[0_1px_5px_#0001]"
        @click="showPanelSection(section)"
      >
        {{ t(section === 'now' ? 'now_playing' : 'queue') }}
      </button>
    </div>
    <div
      v-if="ui.panel === 'now'"
      class="min-h-0 flex-1 [scrollbar-width:thin] overflow-auto overscroll-contain px-24 pb-28"
    >
      <NowPlayingDetails
        :playback="playback.current"
        :status="status"
        :controls-disabled="controlsDisabled"
        :volume="connection.volume"
        :labels="labels"
        @transport="onTransport"
        @navigate="onNavigate"
      />
    </div>
    <div v-else class="min-h-0 flex-1 [scrollbar-width:thin] overflow-auto overscroll-contain px-24 pb-28">
      <div class="flex items-end justify-between">
        <div>
          <span class="text-9 font-[650] tracking-[1.8px] text-muted uppercase">{{ t('your_selection') }}</span>
          <h2 class="mt-6 mb-4 text-24 font-bold tracking-[-0.8px]">{{ t('queue') }}</h2>
        </div>
        <UiIconButton
          icon="refresh"
          :label="t('refresh_queue')"
          :disabled="connection.connection !== 'connected' || queue.status === 'loading'"
          @click="loadQueue"
        />
      </div>
      <p class="mt-4 mb-4 text-11 text-muted" role="status">{{ queueHint }}</p>
      <p v-if="queue.status === 'ready'" class="mt-0 mb-14 text-10 leading-[1.6] text-muted">
        {{ t('queue_snapshot_note') }}
      </p>
      <QueueRows :items="items" :current="queue.current" />
    </div>
  </aside>
</template>
