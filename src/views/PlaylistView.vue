<script setup lang="ts">
/** Custom playlist detail: its tracks in stock list order (data level). */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DetailHeading from '../components/collection/DetailHeading.vue'
import TrackList from '../components/track/TrackList.vue'
import TrackListSkeleton from '../components/track/TrackListSkeleton.vue'
import { filterBy } from '../domain/search'
import type { LibraryTrack } from '../domain/track'
import { t } from '../i18n'
import { coverFor } from '../stores/enrichment'
import { library, loadPlaylistTracks } from '../stores/library'
import { isPlaying, playback } from '../stores/playback'
import { openTrackMenu, ui } from '../stores/ui'
import UiPillButton from '../ui/UiPillButton.vue'
import UiTextButton from '../ui/UiTextButton.vue'
import { selection } from '../stores/selection'
import { playFrom } from './playAlbum'
import { trackArtistRoute, trackAlbumRoute } from './captions'
import CollectionGate from './CollectionGate.vue'

const route = useRoute()
const router = useRouter()
const id = computed(() => Number(route.params.id))
const playlist = computed(() => library.playlists.find((item) => item.id === id.value) ?? null)
const tracks = ref<LibraryTrack[] | null>(null)
let request = 0
watch(
  id,
  async (value) => {
    const current = ++request
    tracks.value = null
    try {
      const rows = await loadPlaylistTracks(value)
      if (current === request) tracks.value = rows
    } catch {
      if (current === request) tracks.value = []
    }
  },
  { immediate: true },
)
const searching = computed(() => ui.query.trim() !== '')
const items = computed(() =>
  filterBy(tracks.value ?? [], ui.query, (track) => [track.title, track.artist, track.album]),
)
</script>

<template>
  <CollectionGate :count="items.length" :searching="searching" empty-key="search_empty_tracks" :ready="tracks !== null">
    <template #heading="{ loading }">
      <UiTextButton class="text-12" @click="router.push('/playlists')">← {{ t('back_to_collection') }}</UiTextButton>
      <DetailHeading :title="playlist?.name ?? ''">
        <template #meta>
          <span v-if="loading" class="inline-block h-10 w-90 animate-pulse rounded-4 bg-soft align-middle" />
          <template v-else>{{ t('track_count', { count: tracks?.length ?? 0 }) }}</template>
        </template>
        <UiPillButton
          icon="play"
          :disabled="loading || !tracks?.length || !playlist || selection.busy"
          @click="playlist && playFrom({ kind: 'playlist', name: playlist.name })"
          >{{ t('listen_playlist') }}</UiPillButton
        >
      </DetailHeading>
    </template>
    <template #skeleton>
      <TrackListSkeleton :rows="Math.max(1, Math.min(playlist?.trackCount ?? 6, 12))" actions />
    </template>
    <TrackList
      :artist-to="trackArtistRoute"
      :album-to="trackAlbumRoute"
      :tracks="items"
      :current-path="playback.current.track?.path ?? null"
      :playing="isPlaying"
      :cover-of="coverFor"
      :play-label="t('play_label')"
      :disabled="selection.busy"
      :menu-label="t('track_actions')"
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
          )
      "
    />
  </CollectionGate>
</template>
