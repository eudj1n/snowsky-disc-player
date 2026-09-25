<script setup lang="ts">
/**
 * Album detail. The route carries the album title and, optionally, one
 * literal track artist (reference album scope): a scoped page lists and plays
 * only that artist's release (stock type 7), so albums that share a title stay
 * apart. An unscoped title group with several artists offers the artists as
 * filters instead of guessing an album artist. "More by" shelves follow.
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CoverCard from '../components/collection/CoverCard.vue'
import CoverRow from '../components/collection/CoverRow.vue'
import DetailHeading from '../components/collection/DetailHeading.vue'
import SectionHeading from '../components/common/SectionHeading.vue'
import TrackList from '../components/track/TrackList.vue'
import TrackListSkeleton from '../components/track/TrackListSkeleton.vue'
import { albumTracks, albumsBy } from '../domain/album'
import { filterBy } from '../domain/search'
import type { SelectionTarget, TrackKey } from '../gateway/selection'
import { t } from '../i18n'
import { albumCover } from '../stores/enrichment'
import { albums, tracks as collection } from '../stores/library'
import { selection } from '../stores/selection'
import { openTrackMenu, ui } from '../stores/ui'
import UiPillButton from '../ui/UiPillButton.vue'
import UiTextButton from '../ui/UiTextButton.vue'
import { albumRoute, artistRoute } from './captions'
import CollectionGate from './CollectionGate.vue'
import { onRowFavorite, trackRowProps } from './trackRows'
import { playAlbumAction, playFrom } from './playAlbum'

const MORE_BY_ARTISTS = 3
const CHIP =
  'rounded-20 border border-line px-15 py-8 text-10 text-muted hover:text-ink aria-[current=page]:border-secondary aria-[current=page]:bg-secondary aria-[current=page]:text-white dark:aria-[current=page]:border-[#bfcea9] dark:aria-[current=page]:bg-[#bfcea9] dark:aria-[current=page]:text-[#192214]'

const route = useRoute()
const router = useRouter()
const name = computed(() => String(route.params.name ?? ''))
const scope = computed(() => {
  const artist = route.params.artist
  return typeof artist === 'string' && artist !== '' ? artist : null
})
const group = computed(() => albums.value.find((item) => item.title === name.value) ?? null)
const tracks = computed(() => albumTracks(collection.value, name.value, scope.value))
const credits = computed(() => (scope.value ? [scope.value] : (group.value?.artists ?? [])))
/** Several artists share this title: offer them as filters (and the whole group). */
const choices = computed(() => ((group.value?.trackArtists.length ?? 0) > 1 ? (group.value?.trackArtists ?? []) : []))
const searching = computed(() => ui.query.trim() !== '')
const items = computed(() => filterBy(tracks.value, ui.query, (track) => [track.title, track.artist, track.album]))
const moreBy = computed(() =>
  (scope.value ? [scope.value] : (group.value?.trackArtists ?? []).slice(0, MORE_BY_ARTISTS))
    .map((artist) => ({ artist, albums: albumsBy(albums.value, artist, name.value) }))
    .filter((shelf) => shelf.albums.length > 0),
)

function target(track?: TrackKey): SelectionTarget {
  return scope.value
    ? { kind: 'artistAlbum', artist: scope.value, album: name.value, ...(track ? { track } : {}) }
    : { kind: 'album', album: name.value, ...(track ? { track } : {}) }
}
const back = () => router.push(scope.value ? artistRoute(scope.value) : '/albums')
</script>

<template>
  <CollectionGate :count="items.length" :searching="searching" empty-key="search_empty_tracks">
    <template #heading="{ loading }">
      <UiTextButton class="text-12" @click="back">← {{ scope ?? t('back_to_collection') }}</UiTextButton>
      <DetailHeading :title="name" :cover="group ? albumCover(group, scope) : null">
        <template #meta>
          <template v-if="loading"
            ><span class="inline-block h-10 w-140 animate-pulse rounded-4 bg-soft align-middle"
          /></template>
          <template v-else>
            <template v-for="(artist, index) in credits" :key="artist">
              <RouterLink
                :to="artistRoute(artist)"
                class="underline-offset-3 hover:text-ink hover:underline focus-visible:text-ink focus-visible:underline"
                >{{ artist }}</RouterLink
              ><span v-if="index < credits.length - 1"> · </span>
            </template>
            <span v-if="credits.length"> · </span>{{ t('track_count', { count: tracks.length }) }}
          </template>
        </template>
        <UiPillButton
          icon="play"
          :disabled="loading || !tracks.length || selection.busy"
          @click="playAlbumAction(name, scope)"
          >{{ t('play_album') }}</UiPillButton
        >
      </DetailHeading>
      <nav
        v-if="!loading && choices.length"
        :aria-label="t('album_scope_label')"
        class="mb-24 rounded-12 border border-line bg-raised px-18 py-16"
      >
        <p class="m-0 text-12 leading-[1.6] text-secondary">{{ t('album_scope_note') }}</p>
        <div class="mt-12 flex flex-wrap gap-6">
          <RouterLink :to="albumRoute(name)" :class="CHIP" :aria-current="scope === null ? 'page' : undefined">{{
            t('album_scope_all')
          }}</RouterLink>
          <RouterLink
            v-for="artist in choices"
            :key="artist"
            :to="albumRoute(name, artist)"
            :class="CHIP"
            :aria-current="scope === artist ? 'page' : undefined"
            >{{ artist }}</RouterLink
          >
        </div>
      </nav>
    </template>
    <template #skeleton>
      <TrackListSkeleton :rows="8" lead="number" :album="false" actions />
    </template>
    <TrackList
      v-bind="trackRowProps"
      lead="number"
      :tracks="items"
      :show-album="false"
      @menu="(index, anchor) => items[index] && openTrackMenu(items[index], target(items[index]), anchor)"
      @play="(index) => items[index] && playFrom(target(items[index]))"
      @favorite="onRowFavorite"
    />
    <section
      v-for="shelf in searching ? [] : moreBy"
      :key="shelf.artist"
      :aria-label="t('more_by', { artist: shelf.artist })"
    >
      <SectionHeading :title="t('more_by', { artist: shelf.artist })">
        <UiTextButton icon="arrow" @click="router.push(artistRoute(shelf.artist))">{{ t('all_albums') }}</UiTextButton>
      </SectionHeading>
      <CoverRow :label="t('more_by', { artist: shelf.artist })">
        <CoverCard
          v-for="album in shelf.albums"
          :key="album.title"
          role="listitem"
          :title="album.title"
          :to="albumRoute(album.title, shelf.artist)"
          :cover="albumCover(album, shelf.artist)"
          :lines="[{ text: t('track_count', { count: albumTracks(collection, album.title, shelf.artist).length }) }]"
          :open-label="t('open_item', { name: album.title })"
        />
      </CoverRow>
    </section>
  </CollectionGate>
</template>
