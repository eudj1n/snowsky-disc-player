<script setup lang="ts">
import { computed } from 'vue'
import CoverCard from '../components/collection/CoverCard.vue'
import CoverCardSkeleton from '../components/collection/CoverCardSkeleton.vue'
import CoverGrid from '../components/collection/CoverGrid.vue'
import ViewHeading from '../components/common/ViewHeading.vue'
import { filterBy } from '../domain/search'
import { t } from '../i18n'
import { library } from '../stores/library'
import { ui, openPlaylistDialog } from '../stores/ui'
import UiPillButton from '../ui/UiPillButton.vue'
import { countLine, playlistLines, playlistRoute } from './captions'
import { playFrom } from './playAlbum'
import CollectionGate from './CollectionGate.vue'
import AutoPlaylistsSection from './AutoPlaylistsSection.vue'
import { autoPlaylists } from '../stores/autoPlaylists'

const searching = computed(() => ui.query.trim() !== '')
const items = computed(() => filterBy(library.playlists, ui.query, (playlist) => [playlist.name]))
const skeletonCards = computed(() => Math.max(1, Math.min(library.summary?.playlists ?? 4, 8)))
</script>

<template>
  <CollectionGate :count="items.length" :searching="searching" empty-key="search_empty_playlists">
    <template #heading="{ loading }">
      <ViewHeading
        :eyebrow="t('my_collection')"
        :title="t('playlists')"
        :meta="loading ? null : countLine(searching, items.length)"
      >
        <UiPillButton
          icon="playlist"
          variant="secondary"
          class="self-end"
          @click="openPlaylistDialog({ mode: 'create' })"
          >{{ t('new_playlist') }}</UiPillButton
        >
      </ViewHeading>
    </template>
    <template #skeleton>
      <CoverGrid><CoverCardSkeleton v-for="n in skeletonCards" :key="n" :lines="1" /></CoverGrid>
    </template>
    <CoverGrid>
      <CoverCard
        v-for="playlist in items"
        :key="playlist.id"
        :title="playlist.name"
        :to="playlistRoute(playlist.id)"
        :lines="playlistLines(playlist)"
        :open-label="t('open_item', { name: playlist.name })"
        :play-label="t('play_item', { name: playlist.name })"
        @play="playFrom({ kind: 'playlist', name: playlist.name })"
      />
    </CoverGrid>
  </CollectionGate>
  <!-- Combined-009: the page's automatic playlists, M3U lists the player plays by itself. -->
  <AutoPlaylistsSection v-if="autoPlaylists.available && !searching" />
</template>
