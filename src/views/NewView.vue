<script setup lang="ts">
/**
 * "New": the latest additions by ADD_TIME — tracks as a compact grid and
 * albums as a shelf — and the stock play history when it has entries.
 * No banners; everything comes from the stock library database.
 */
import { computed, onMounted, ref } from 'vue'
import CoverCard from '../components/collection/CoverCard.vue'
import CoverCardSkeleton from '../components/collection/CoverCardSkeleton.vue'
import CoverRow from '../components/collection/CoverRow.vue'
import SectionHeading from '../components/common/SectionHeading.vue'
import HomeIntro from '../components/home/HomeIntro.vue'
import TrackTiles from '../components/track/TrackTiles.vue'
import { recentAlbums, albumScope } from '../domain/album'
import { recentlyAdded, type LibraryTrack, type Track } from '../domain/track'
import { t } from '../i18n'
import { albumCover, coverFor } from '../stores/enrichment'
import { albums, loadRecentlyPlayed, tracks } from '../stores/library'
import { isPlaying, playback } from '../stores/playback'
import { selection } from '../stores/selection'
import { openTrackMenu, ui } from '../stores/ui'
import { filterBy } from '../domain/search'
import UiSkeleton from '../ui/UiSkeleton.vue'
import UiTextButton from '../ui/UiTextButton.vue'
import { albumLines, albumCardRoute, albumRoute, artistRoute } from './captions'
import CollectionGate from './CollectionGate.vue'
import { playFrom } from './playAlbum'

const newTracks = computed(() =>
  filterBy(recentlyAdded(tracks.value, 12), ui.query, (track) => [track.title, track.artist, track.album]),
)
const newAlbums = computed(() =>
  filterBy(recentAlbums(albums.value, 12), ui.query, (album) => [album.title, ...album.artists]),
)
const played = ref<LibraryTrack[]>([])
onMounted(async () => {
  try {
    played.value = await loadRecentlyPlayed(9)
  } catch {
    played.value = []
  }
})
const current = computed(() => playback.current.track?.path ?? null)
const titleTo = (track: Track) => (track.album ? albumRoute(track.album, track.artist || null) : null)
const artistTo = (track: Track) => (track.artist ? artistRoute(track.artist) : null)
</script>

<template>
  <CollectionGate :count="tracks.length" :searching="false" empty-key="search_empty_tracks">
    <template #heading>
      <HomeIntro :eyebrow="t('latest_additions')" :title="t('new_section')" />
    </template>
    <template #skeleton>
      <SectionHeading :title="t('new_tracks')" />
      <div class="grid grid-cols-3 gap-x-28 rail:grid-cols-2 phone:grid-cols-1">
        <div v-for="n in 12" :key="n" class="flex items-center gap-12 border-t border-line/70 py-8">
          <UiSkeleton class="size-44 rounded-6" />
          <div class="flex-1"><UiSkeleton class="h-10 w-[60%]" /><UiSkeleton class="mt-8 h-9 w-[40%]" /></div>
        </div>
      </div>
      <SectionHeading :title="t('new_albums')" />
      <CoverRow :label="t('new_albums')"><CoverCardSkeleton v-for="n in 6" :key="n" /></CoverRow>
    </template>
    <SectionHeading :title="t('new_tracks')">
      <UiTextButton icon="arrow" @click="$router.push('/tracks')">{{ t('all_tracks') }}</UiTextButton>
    </SectionHeading>
    <TrackTiles
      :tracks="newTracks"
      :play-label="t('play_label')"
      :menu-label="t('track_actions')"
      :cover-of="coverFor"
      :current-path="current"
      :playing="isPlaying"
      :title-to="titleTo"
      :artist-to="artistTo"
      :disabled="selection.busy"
      @play="(index) => newTracks[index] && playFrom({ kind: 'library', track: newTracks[index] })"
      @menu="
        (index, anchor) =>
          newTracks[index] && openTrackMenu(newTracks[index], { kind: 'library', track: newTracks[index] }, anchor)
      "
    />
    <SectionHeading :title="t('new_albums')">
      <UiTextButton icon="arrow" @click="$router.push('/albums')">{{ t('all_albums') }}</UiTextButton>
    </SectionHeading>
    <CoverRow :label="t('new_albums')">
      <CoverCard
        v-for="album in newAlbums"
        :key="album.title"
        role="listitem"
        :title="album.title"
        :to="albumCardRoute(album)"
        :cover="albumCover(album, albumScope(album))"
        :lines="albumLines(album)"
        :open-label="t('open_item', { name: album.title })"
      />
    </CoverRow>
    <template v-if="played.length">
      <SectionHeading :title="t('recently_played')" />
      <TrackTiles
        :tracks="played"
        :play-label="t('play_label')"
        :menu-label="t('track_actions')"
        :cover-of="coverFor"
        :current-path="current"
        :playing="isPlaying"
        :title-to="titleTo"
        :artist-to="artistTo"
        :disabled="selection.busy"
        @play="(index) => played[index] && playFrom({ kind: 'library', track: played[index] })"
        @menu="
          (index, anchor) =>
            played[index] && openTrackMenu(played[index], { kind: 'library', track: played[index] }, anchor)
        "
      />
    </template>
  </CollectionGate>
</template>
