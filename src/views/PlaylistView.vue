<script setup lang="ts">
/** Custom playlist detail: its tracks in stock list order (data level). */
import { computed, ref, watch } from 'vue'
import { useCrumbs } from './crumbs'
import { useRoute } from 'vue-router'
import DetailHeading from '../components/collection/DetailHeading.vue'
import TrackList from '../components/track/TrackList.vue'
import TrackListSkeleton from '../components/track/TrackListSkeleton.vue'
import type { LibraryTrack } from '../domain/track'
import { t } from '../i18n'
import { library, loadPlaylistTracks, trackByPath } from '../stores/library'
import { openPlaylistDialog, openTrackMenu, openTrackPanel } from '../stores/ui'
import { playlistEdits } from '../stores/playlistEdits'
import UiActionMenu from '../ui/UiActionMenu.vue'
import UiPillButton from '../ui/UiPillButton.vue'
import { useHeadingAction } from './headingAction'
import { playFrom } from './playAlbum'
import CollectionGate from './CollectionGate.vue'
import { onRowFavorite, onRowUnfavorite, trackRowProps } from './trackRows'

const route = useRoute()
const id = computed(() => Number(route.params.id))
const playlist = computed(() => library.playlists.find((item) => item.id === id.value) ?? null)
useCrumbs(() => [{ text: t('playlists'), to: '/playlists' }, { text: playlist.value?.name ?? '' }])
const tracks = ref<LibraryTrack[] | null>(null)
let request = 0
// Reload after the list changed (an edit here or elsewhere). Members are
// addressed by the list's LIST_ID, known once the collection lists it.
watch(
  () => [id.value, playlist.value?.listId ?? null, playlistEdits.revision] as const,
  async ([value, listId], previous) => {
    const current = ++request
    // A new playlist shows its skeleton; a reload after an edit keeps the rows.
    if (previous?.[0] !== value) tracks.value = null
    if (listId === null) return
    try {
      const rows = await loadPlaylistTracks(listId)
      if (current === request) tracks.value = rows
    } catch {
      if (current === request) tracks.value = []
    }
  },
  { immediate: true },
)
const heading = useHeadingAction({
  owns: (track) => (tracks.value ?? []).some((item) => item.path === track.path),
  label: () => t('listen_playlist'),
  disabled: () => !tracks.value?.length || !playlist.value,
  play: () => void (playlist.value && playFrom({ kind: 'playlist', name: playlist.value.name })),
})
const items = computed(() => tracks.value ?? [])
/** An entry whose file was deleted stays in place, dimmed (stock keeps it; the file may come back). */
const unavailable = (track: { path: string | null }) =>
  library.status === 'ready' && (track.path === null || !trackByPath.value.has(track.path))
</script>

<template>
  <CollectionGate :count="items.length" :ready="tracks !== null">
    <template #heading="{ loading }">
      <DetailHeading
        :title="playlist?.name ?? ''"
        :kind="t('kind_playlist')"
        :sticky-action="loading ? null : heading.action.value"
        @sticky="heading.run"
      >
        <template #sticky>{{ t('track_count', { count: tracks?.length ?? 0 }) }}</template>
        <template #meta>
          <span v-if="loading" class="inline-block h-10 w-90 animate-pulse rounded-4 bg-soft align-middle" />
          <template v-else>{{ t('track_count', { count: tracks?.length ?? 0 }) }}</template>
        </template>
        <UiPillButton
          icon="play"
          :disabled="loading || !tracks?.length || !playlist"
          @click="playlist && playFrom({ kind: 'playlist', name: playlist.name })"
          >{{ t('listen_playlist') }}</UiPillButton
        >
        <!-- Renaming and deleting are rare: behind "⋯" (owner, 2026-09-30). -->
        <UiActionMenu
          :label="t('more_actions')"
          :disabled="loading || !playlist"
          :items="[
            { id: 'rename', label: t('rename'), icon: 'pencil' },
            { id: 'delete', label: t('delete'), icon: 'trash', danger: true },
          ]"
          data-testid="playlist-actions"
          @choose="
            (id) =>
              playlist && openPlaylistDialog({ mode: id === 'rename' ? 'rename' : 'delete', playlist: playlist.name })
          "
        />
      </DetailHeading>
    </template>
    <template #skeleton>
      <TrackListSkeleton :rows="Math.max(1, Math.min(playlist?.trackCount ?? 6, 12))" actions />
    </template>
    <TrackList
      v-bind="trackRowProps"
      :tracks="items"
      :unavailable-of="unavailable"
      :unavailable-label="t('track_unavailable')"
      @play="
        (index) => playlist && items[index] && playFrom({ kind: 'playlist', name: playlist.name, track: items[index] })
      "
      @menu="
        (index, anchor) =>
          items[index] &&
          openTrackMenu(
            items[index],
            playlist ? { kind: 'playlist', name: playlist.name, track: items[index] } : null,
            anchor,
            playlist?.name ?? null,
          )
      "
      @open="
        (index, anchor) =>
          items[index] &&
          openTrackPanel(
            items[index],
            playlist ? { kind: 'playlist', name: playlist.name, track: items[index] } : null,
            anchor,
            playlist?.name ?? null,
          )
      "
      @favorite="onRowFavorite"
      @unfavorite="onRowUnfavorite"
    />
  </CollectionGate>
</template>
