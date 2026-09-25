<script setup lang="ts">
/**
 * Shared view states (reference renderView/loadView): service unreachable,
 * failed with retry, empty collection, no search matches. While the
 * collection loads, the view's heading renders with its own skeleton in
 * place of the data, so nothing moves when the rows arrive.
 */
import { computed } from 'vue'
import ConnectCard from '../components/connection/ConnectCard.vue'
import EmptyState from '../components/common/EmptyState.vue'
import HomeIntro from '../components/home/HomeIntro.vue'
import { t, type MessageKey } from '../i18n'
import { connection } from '../stores/connection'
import { library, loadCollection } from '../stores/library'
import { openDialog } from '../stores/ui'
import UiPillButton from '../ui/UiPillButton.vue'

const props = withDefaults(
  defineProps<{ count: number; searching: boolean; emptyKey: MessageKey; ready?: boolean }>(),
  {
    ready: true,
  },
)
const loading = computed(
  () =>
    connection.gateway === null ||
    library.status === 'idle' ||
    (library.status === 'loading' && !library.tracks.length) ||
    !props.ready,
)
</script>

<template>
  <template v-if="connection.gateway === false">
    <HomeIntro :eyebrow="t('your_music_your_space')" :title="t('welcome_back')" />
    <EmptyState icon="device" :title="t('it_starts_with_your_disc')" :text="t('connect_your_player_to_explore')">
      <ConnectCard :action="t('connect_your_player')" @open="openDialog('connection')" />
    </EmptyState>
  </template>
  <EmptyState
    v-else-if="library.status === 'failed' && !library.tracks.length"
    icon="info"
    :title="t('collection_unavailable')"
    :text="t('request_failed')"
  >
    <UiPillButton variant="secondary" @click="loadCollection">{{ t('refresh') }}</UiPillButton>
  </EmptyState>
  <div v-else-if="loading" :aria-busy="true">
    <span role="status" class="sr-only">{{ t('gathering_your_collection') }}</span>
    <slot name="heading" :loading="true" />
    <slot name="skeleton" />
  </div>
  <template v-else>
    <slot name="heading" :loading="false" />
    <EmptyState v-if="!count && searching" icon="search" :title="t('no_matches_yet')" :text="t(emptyKey)" />
    <EmptyState
      v-else-if="!count"
      icon="music"
      :title="t('a_little_quiet_here')"
      :text="t('collection_appears_after_adding_music')"
    />
    <!-- Loaded content settles in after its skeleton. -->
    <div v-else class="animate-content-in motion-reduce:animate-none"><slot /></div>
    <p v-if="library.truncated" class="mt-24 text-11 leading-[1.6] text-muted">
      {{ t('library_truncated', { count: 10000 }) }}
    </p>
  </template>
</template>
