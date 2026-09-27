<script setup lang="ts">
/**
 * One genre, like New: its latest tracks as tiles (the whole list is Tracks
 * filtered by the genre), its albums as a shelf and its artists below.
 * Playback stays in the stock genre scope (reference genre playback); albums
 * that also hold other genres open narrowed to this one. Artists leave the
 * genre scope, as in the reference.
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CoverCard from '../components/collection/CoverCard.vue'
import CoverCardSkeleton from '../components/collection/CoverCardSkeleton.vue'
import CoverRow from '../components/collection/CoverRow.vue'
import DetailHeading from '../components/collection/DetailHeading.vue'
import SectionHeading from '../components/common/SectionHeading.vue'
import TrackTiles from '../components/track/TrackTiles.vue'
import { albumScope, albumTracks, type Album } from '../domain/album'
import { findGenre, genreAlbums, genreArtists, genreTracks, playableGenre, sameGenre } from '../domain/genre'
import { filterBy } from '../domain/search'
import { recentlyAdded, type Track } from '../domain/track'
import type { SelectionTarget, TrackKey } from '../gateway/selection'
import { t } from '../i18n'
import { albumCover, coverFor } from '../stores/enrichment'
import { albums, genres, titleGroups, tracks as collection } from '../stores/library'
import { isPlaying, playback } from '../stores/playback'
import { selection } from '../stores/selection'
import { openTrackMenu, ui } from '../stores/ui'
import UiPillButton from '../ui/UiPillButton.vue'
import UiSkeleton from '../ui/UiSkeleton.vue'
import UiTextButton from '../ui/UiTextButton.vue'
import { albumLines, albumRoute, artistRoute, genreAlbumRoute } from './captions'
import CollectionGate from './CollectionGate.vue'
import { useHeadingAction } from './headingAction'
import { playFrom } from './playAlbum'
import { toggleCurrent } from './trackRows'

const LATEST = 12
const route = useRoute()
const router = useRouter()
const name = computed(() => String(route.params.name ?? ''))
/** The genre in any of its spellings; the page shows its main one. */
const genre = computed(() => findGenre(genres.value, name.value))
const shown = computed(() => genre.value?.name ?? name.value.trim())
const tracks = computed(() => genreTracks(collection.value, name.value))
/** Stock plays one spelling at a time: the one most of this genre's tracks carry. */
const literal = computed(() => (genre.value ? playableGenre(tracks.value, genre.value) : name.value))
const spellings = computed(() => (genre.value && genre.value.variants.length > 1 ? genre.value.variants : null))
const searching = computed(() => ui.query.trim() !== '')
const latest = computed(() =>
  filterBy(recentlyAdded(tracks.value, searching.value ? tracks.value.length : LATEST), ui.query, (track) => [
    track.title,
    track.artist,
    track.album,
  ]).slice(0, LATEST),
)
const shelf = computed(() =>
  filterBy(genre.value ? genreAlbums(albums.value, genre.value) : [], ui.query, (album) => [
    album.title,
    ...album.artists,
  ]),
)
const artists = computed(() =>
  filterBy(genreArtists(collection.value, name.value), ui.query, (artist) => [artist.name]),
)
const count = computed(() => latest.value.length + shelf.value.length + artists.value.length)
const current = computed(() => playback.current.track?.path ?? null)
/** The album also holds tracks of other genres. */
const mixed = (album: Album) =>
  albumTracks(collection.value, album.title, albumScope(album)).some((track) => !sameGenre(track.genre, name.value))
const titleTo = (track: Track) =>
  track.album
    ? genre.value && mixed(album(track.album))
      ? genreAlbumLink(track.album)
      : albumRoute(track.album, track.artist || null)
    : null
const artistTo = (name: string) => artistRoute(name)

function album(title: string): Album {
  return (
    titleGroups.value.find((item) => item.title === title) ?? {
      key: JSON.stringify([title]),
      title,
      artists: [],
      trackArtists: [],
      paths: {},
      trackCount: 0,
      genres: [],
      ids: [],
      addedAt: null,
    }
  )
}
function genreAlbumLink(title: string) {
  return { name: 'album', params: { name: title }, query: { genre: name.value } }
}
/** A track plays in the stock genre of its own spelling; the whole genre in the main one. */
function target(track?: TrackKey & { genre?: string | null }): SelectionTarget {
  const own = track?.genre && sameGenre(track.genre, name.value) ? track.genre : literal.value
  return { kind: 'genre', genre: own, ...(track ? { track: { title: track.title, artist: track.artist } } : {}) }
}
const heading = useHeadingAction({
  owns: (track) => tracks.value.some((item) => item.path === track.path),
  label: () => t('play_genre'),
  disabled: () => !tracks.value.length || selection.busy,
  play: () => void playFrom(target()),
})
function playAlbum(item: Album): void {
  const scope = albumScope(item)
  void playFrom(
    mixed(item)
      ? {
          kind: 'genreAlbum',
          genre: genre.value
            ? playableGenre(albumTracks(collection.value, item.title, scope), genre.value)
            : name.value,
          album: item.title,
        }
      : scope
        ? { kind: 'artistAlbum', artist: scope, album: item.title }
        : { kind: 'album', album: item.title },
  )
}
</script>

<template>
  <CollectionGate :count="count" :searching="searching" empty-key="search_empty_tracks">
    <template #heading="{ loading }">
      <UiTextButton class="text-12" @click="router.push('/genres')">← {{ t('back_to_genres') }}</UiTextButton>
      <DetailHeading :title="shown" :sticky-action="loading ? null : heading.action.value" @sticky="heading.run">
        <template #sticky
          >{{ t('album_count', { count: genre?.albums.length ?? 0 }) }} ·
          {{ t('track_count', { count: tracks.length }) }}</template
        >
        <template #meta>
          <span v-if="loading" class="inline-block h-10 w-140 animate-pulse rounded-4 bg-soft align-middle" />
          <template v-else
            >{{ t('album_count', { count: genre?.albums.length ?? 0 }) }} ·
            {{ t('track_count', { count: tracks.length }) }}</template
          >
        </template>
        <UiPillButton icon="play" :disabled="loading || !tracks.length || selection.busy" @click="playFrom(target())">{{
          t('play_genre')
        }}</UiPillButton>
      </DetailHeading>
      <p
        v-if="!loading && spellings"
        class="-mt-10 mb-18 text-11 leading-[1.6] text-muted"
        data-testid="genre-spellings"
      >
        {{ t('genre_spellings', { spellings: spellings.map((item) => `“${item}”`).join(', '), main: `“${literal}”` }) }}
      </p>
    </template>
    <template #skeleton>
      <SectionHeading :title="t('new_tracks')" class="mt-0!" />
      <div class="grid grid-cols-3 gap-x-28 rail:grid-cols-2 phone:grid-cols-1">
        <div v-for="n in 6" :key="n" class="flex items-center gap-12 border-t border-line/70 py-8">
          <UiSkeleton class="size-44 rounded-6" />
          <div class="flex-1"><UiSkeleton class="h-10 w-[60%]" /><UiSkeleton class="mt-8 h-9 w-[40%]" /></div>
        </div>
      </div>
      <SectionHeading :title="t('albums')" />
      <CoverRow :label="t('albums')"><CoverCardSkeleton v-for="n in 6" :key="n" /></CoverRow>
    </template>
    <template v-if="latest.length">
      <SectionHeading :title="t(searching ? 'genre_tracks' : 'new_tracks')" class="mt-0!">
        <UiTextButton icon="arrow" @click="router.push({ path: '/tracks', query: { genre: name } })">{{
          t('all_tracks')
        }}</UiTextButton>
      </SectionHeading>
      <TrackTiles
        :tracks="latest"
        :play-label="t('play_label')"
        :menu-label="t('track_actions')"
        :cover-of="coverFor"
        :current-path="current"
        :playing="isPlaying"
        :toggle-current="toggleCurrent"
        :pause-label="t('pause')"
        :title-to="titleTo"
        :artist-to="artistTo"
        :disabled="selection.busy"
        @play="(index) => latest[index] && playFrom(target(latest[index]))"
        @menu="(index, anchor) => latest[index] && openTrackMenu(latest[index], target(latest[index]), anchor)"
      />
    </template>
    <template v-if="shelf.length">
      <SectionHeading :title="t('albums')" />
      <CoverRow :label="t('albums')">
        <CoverCard
          v-for="item in shelf"
          :key="item.key"
          role="listitem"
          :title="item.title"
          :to="genreAlbumRoute(item, name, mixed(item))"
          :cover="albumCover(item, albumScope(item))"
          :lines="albumLines(item)"
          :open-label="t('open_item', { name: item.title })"
          :play-label="t('play_item', { name: item.title })"
          :play-disabled="selection.busy"
          @play="playAlbum(item)"
        />
      </CoverRow>
    </template>
    <template v-if="artists.length">
      <SectionHeading :title="t('artists')" />
      <CoverRow :label="t('artists')">
        <CoverCard
          v-for="artist in artists"
          :key="artist.name"
          role="listitem"
          artist
          :title="artist.name"
          :to="artistRoute(artist.name)"
          :lines="[{ text: t('track_count', { count: artist.trackCount }) }]"
          :open-label="t('open_item', { name: artist.name })"
          :play-label="artist.literal ? t('play_item', { name: artist.name }) : null"
          :play-disabled="selection.busy"
          @play="playFrom({ kind: 'artist', artist: artist.name })"
        />
      </CoverRow>
    </template>
  </CollectionGate>
</template>
