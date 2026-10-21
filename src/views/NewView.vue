<script setup lang="ts">
/**
 * "New": the latest additions by ADD_TIME — tracks as a compact grid, albums
 * as a shelf and the artists who first appeared with those albums — and the
 * stock play history when it has entries. No banners; everything comes from
 * the stock library database.
 */
import { computed, onMounted, ref } from 'vue'
import CoverCard from '../components/collection/CoverCard.vue'
import CoverCardSkeleton from '../components/collection/CoverCardSkeleton.vue'
import CoverRow from '../components/collection/CoverRow.vue'
import SectionHeading from '../components/common/SectionHeading.vue'
import HomeIntro from '../components/home/HomeIntro.vue'
import TrackTiles from '../components/track/TrackTiles.vue'
import { recentAlbums, albumScope } from '../domain/album'
import { newArtists } from '../domain/artist'
import { recentlyAdded, type LibraryTrack, type Track } from '../domain/track'
import { t } from '../i18n'
import { artistImage } from '../stores/artistPictures'
import { albumCover, coverFor } from '../stores/enrichment'
import { albums, artists, loadRecentlyPlayed, tracks } from '../stores/library'
import { nowIsPlaying as isPlaying, nowPlaying } from '../stores/output'
import { isPinnedArtist } from '../stores/pins'
import { openTrackMenu } from '../stores/ui'
import UiSkeleton from '../ui/UiSkeleton.vue'
import UiTextButton from '../ui/UiTextButton.vue'
import { albumLines, albumCardRoute, albumRoute, artistRoute } from './captions'
import CollectionGate from './CollectionGate.vue'
import { playFrom, playAlbumCard } from './playAlbum'
import { isDisliked } from '../stores/disliked'
import { toggleCurrent } from './trackRows'

// Disliked tracks stay off the shelf (combined-008).
const newTracks = computed(() =>
  recentlyAdded(
    tracks.value.filter((track) => !isDisliked(track)),
    12,
  ),
)
const newAlbums = computed(() => recentAlbums(albums.value, 12))
// Debuts among the latest additions: artists first seen no earlier than the first track of the oldest new
// album (an album arrives over seconds; its latest track would miss the artist who debuted with it).
const debuts = computed(() =>
  newArtists(artists.value, Math.min(...newAlbums.value.map((album) => album.firstAddedAt ?? Infinity)), 12),
)
const played = ref<LibraryTrack[]>([])
onMounted(async () => {
  try {
    played.value = await loadRecentlyPlayed(9)
  } catch {
    played.value = []
  }
})
const current = computed(() => nowPlaying.value.track?.path ?? null)
const titleTo = (track: Track) => (track.album ? albumRoute(track.album, track.artist || null) : null)
const artistTo = (name: string) => artistRoute(name)
</script>

<template>
  <CollectionGate :count="tracks.length">
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
      :toggle-current="toggleCurrent"
      :pause-label="t('pause')"
      :title-to="titleTo"
      :artist-to="artistTo"
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
        :key="album.key"
        role="listitem"
        :title="album.title"
        :to="albumCardRoute(album)"
        :cover="albumCover(album, albumScope(album))"
        :lines="albumLines(album)"
        :open-label="t('open_item', { name: album.title })"
        :play-label="t('play_item', { name: album.title })"
        @play="playAlbumCard(album)"
      />
    </CoverRow>
    <template v-if="debuts.length">
      <SectionHeading :title="t('new_artists')">
        <UiTextButton icon="arrow" @click="$router.push('/artists')">{{ t('all_artists') }}</UiTextButton>
      </SectionHeading>
      <CoverRow :label="t('new_artists')">
        <CoverCard
          v-for="artist in debuts"
          :key="artist.name"
          role="listitem"
          :title="artist.name"
          :to="artistRoute(artist.name)"
          artist
          :cover="artistImage(artist.name)"
          :pinned-label="isPinnedArtist(artist.name) ? t('pinned_mark') : null"
          :open-label="t('open_item', { name: artist.name })"
          :play-label="artist.literal ? t('play_item', { name: artist.name }) : null"
          @play="playFrom({ kind: 'artist', artist: artist.name })"
        />
      </CoverRow>
    </template>
    <template v-if="played.length">
      <SectionHeading :title="t('recently_played')" />
      <TrackTiles
        :tracks="played"
        :play-label="t('play_label')"
        :menu-label="t('track_actions')"
        :cover-of="coverFor"
        :current-path="current"
        :playing="isPlaying"
        :toggle-current="toggleCurrent"
        :pause-label="t('pause')"
        :title-to="titleTo"
        :artist-to="artistTo"
        @play="(index) => played[index] && playFrom({ kind: 'library', track: played[index] })"
        @menu="
          (index, anchor) =>
            played[index] && openTrackMenu(played[index], { kind: 'library', track: played[index] }, anchor)
        "
      />
    </template>
  </CollectionGate>
</template>
