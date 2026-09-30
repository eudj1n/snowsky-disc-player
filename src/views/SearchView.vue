<script setup lang="ts">
/**
 * The search page (owner, 2026-09-30): every match in the collection, by
 * kind, the section the search came from first. The palette's All results
 * and the phone's search button open it; its field keeps the query in the
 * address (#/search?q=…), so Back returns to the same results.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Artwork from '../components/artwork/Artwork.vue'
import CoverCard from '../components/collection/CoverCard.vue'
import CoverGrid from '../components/collection/CoverGrid.vue'
import EmptyState from '../components/common/EmptyState.vue'
import SectionHeading from '../components/common/SectionHeading.vue'
import ViewHeading from '../components/common/ViewHeading.vue'
import GenreGrid from '../components/genre/GenreGrid.vue'
import GenreTile from '../components/genre/GenreTile.vue'
import TrackList from '../components/track/TrackList.vue'
import { albumScope } from '../domain/album'
import type { LibraryTrack } from '../domain/track'
import { t } from '../i18n'
import { artistImage } from '../stores/artistPictures'
import { albumCover } from '../stores/enrichment'
import { isPinnedAlbum, isPinnedArtist } from '../stores/pins'
import { openTrackMenu } from '../stores/ui'
import UiCircleButton from '../ui/UiCircleButton.vue'
import UiIcon from '../ui/UiIcon.vue'
import UiTextButton from '../ui/UiTextButton.vue'
import { albumCardRoute, albumLines, artistRoute, genreRoute, trackAlbumRoute } from './captions'
import CollectionGate from './CollectionGate.vue'
import { genreRecords } from './genreRecords'
import { playAlbumCard, playFrom } from './playAlbum'
import {
  hitCover,
  hitIcon,
  hitLine,
  hitRoute,
  hitTarget,
  hitTitle,
  searchCollection,
  type GroupKind,
  type Hit,
} from './searchResults'
import { onRowFavorite, onRowUnfavorite, trackRowProps } from './trackRows'

const KINDS: readonly GroupKind[] = ['tracks', 'albums', 'artists', 'playlists', 'genres']
/** How many of each kind show before Show all. */
const SHOWN: Record<GroupKind, number> = { tracks: 5, albums: 8, artists: 8, playlists: 8, genres: 8 }

const route = useRoute()
const router = useRouter()
const field = ref<HTMLInputElement | null>(null)
const query = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
const from = computed(() => KINDS.find((kind) => kind === route.query.from) ?? null)
const text = ref(query.value)
watch(query, (value) => {
  if (value.trim() !== text.value.trim()) text.value = value
})
/** The address follows the field without a history entry per letter. */
function onInput(value: string): void {
  text.value = value
  void router.replace({ query: { ...route.query, q: value.trim() ? value : undefined } })
}
const results = computed(() => searchCollection(query.value, from.value))
const expanded = ref(new Set<GroupKind>())
watch(query, () => (expanded.value = new Set()))
const shown = <T,>(kind: GroupKind, items: readonly T[]) =>
  expanded.value.has(kind) ? items : items.slice(0, SHOWN[kind])
const expand = (kind: GroupKind) => (expanded.value = new Set([...expanded.value, kind]))
const nothing = computed(() => query.value.trim() !== '' && !results.value.top)

const trackHits = (hits: readonly Hit[]): LibraryTrack[] =>
  hits.flatMap((hit) => (hit.kind === 'tracks' ? [hit.track] : []))
const trackTarget = (track: LibraryTrack) =>
  ({ kind: 'library', track: { title: track.title, artist: track.artist } }) as const
const columns = computed(() => ({
  title: t('column_title'),
  album: t('column_album'),
  duration: t('column_duration'),
}))

/** The top result opens its page; a track's title opens its album. */
const topRoute = (hit: Hit) => hitRoute(hit) ?? (hit.kind === 'tracks' ? trackAlbumRoute(hit.track) : null)
function playTop(hit: Hit): void {
  const target = hitTarget(hit)
  if (target) void playFrom(target)
}

onMounted(() => {
  // Opened from the phone's search button: straight to typing.
  if (!query.value) field.value?.focus()
})
</script>

<template>
  <CollectionGate :count="1">
    <template #heading>
      <ViewHeading :eyebrow="t('my_collection')" :title="t('search')" />
      <label
        class="mb-10 flex max-w-640 items-center gap-12 rounded-12 bg-soft px-16 py-12 text-muted focus-within:shadow-[0_0_0_2px_var(--focus-ring)] phone:px-12 phone:py-10"
      >
        <UiIcon name="search" class="size-20 shrink-0" />
        <input
          ref="field"
          type="search"
          autocomplete="off"
          spellcheck="false"
          data-testid="search-field"
          :value="text"
          :aria-label="t('search_collection')"
          :placeholder="t('search_collection')"
          class="w-full min-w-0 border-0 bg-transparent text-title3 text-ink outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
          @input="onInput(($event.target as HTMLInputElement).value)"
        />
      </label>
    </template>
    <p v-if="!query.trim()" class="mt-18 text-footnote text-muted">{{ t('search_hint') }}</p>
    <EmptyState
      v-else-if="nothing"
      icon="search"
      :title="t('search_nothing', { query: query.trim() })"
      :text="t('search_nothing_hint')"
    />
    <template v-else>
      <section v-if="results.top" aria-labelledby="search-top">
        <SectionHeading id="search-top" :title="t('search_top')" />
        <div
          class="flex max-w-640 items-center gap-20 rounded-14 bg-soft p-20 phone:gap-14 phone:p-14"
          data-testid="search-top"
        >
          <span
            v-if="hitIcon(results.top)"
            aria-hidden="true"
            class="grid size-96 shrink-0 place-items-center rounded-12 bg-raised text-secondary phone:size-72"
          >
            <UiIcon :name="hitIcon(results.top) ?? 'music'" class="size-36" />
          </span>
          <span
            v-else
            aria-hidden="true"
            class="relative size-96 shrink-0 overflow-hidden bg-raised phone:size-72"
            :class="results.top.kind === 'artists' ? 'rounded-full' : 'rounded-10'"
          >
            <Artwork
              :title="hitTitle(results.top)"
              :cover="hitCover(results.top)"
              :artist="results.top.kind === 'artists'"
            />
          </span>
          <span class="min-w-0 flex-1">
            <RouterLink
              v-if="topRoute(results.top)"
              :to="topRoute(results.top) ?? '/'"
              class="block truncate text-title2 font-bold tracking-heading hover:underline"
              >{{ hitTitle(results.top) }}</RouterLink
            >
            <span v-else class="block truncate text-title2 font-bold tracking-heading">{{
              hitTitle(results.top)
            }}</span>
            <span class="mt-6 block truncate text-footnote text-muted">{{ hitLine(results.top) }}</span>
          </span>
          <UiCircleButton
            v-if="hitTarget(results.top)"
            icon="play"
            :label="t('play_item', { name: hitTitle(results.top) })"
            @click="results.top && playTop(results.top)"
          />
        </div>
      </section>
      <section
        v-for="group in results.groups"
        :key="group.kind"
        :aria-labelledby="`search-${group.kind}`"
        :data-testid="`search-${group.kind}`"
      >
        <SectionHeading :id="`search-${group.kind}`" :title="t(group.kind)">
          <UiTextButton v-if="group.hits.length > shown(group.kind, group.hits).length" @click="expand(group.kind)">{{
            t('search_show_all', { count: group.hits.length })
          }}</UiTextButton>
        </SectionHeading>
        <TrackList
          v-if="group.kind === 'tracks'"
          v-bind="trackRowProps"
          :tracks="shown('tracks', trackHits(group.hits))"
          :header="columns"
          @menu="
            (index, anchor) => {
              const track = shown('tracks', trackHits(group.hits))[index]
              if (track) openTrackMenu(track, trackTarget(track), anchor)
            }
          "
          @play="
            (index) => {
              const track = shown('tracks', trackHits(group.hits))[index]
              if (track) void playFrom(trackTarget(track))
            }
          "
          @favorite="onRowFavorite"
          @unfavorite="onRowUnfavorite"
        />
        <GenreGrid v-else-if="group.kind === 'genres'">
          <template v-for="hit in shown('genres', group.hits)" :key="hit.key">
            <GenreTile
              v-if="hit.kind === 'genres'"
              :name="hit.genre.name"
              :to="genreRoute(hit.genre.name)"
              :caption="`${t('album_count', { count: hit.genre.albums.length })} · ${t('track_count', { count: hit.genre.trackCount })}`"
              :records="genreRecords(hit.genre.albums)"
            />
          </template>
        </GenreGrid>
        <CoverGrid v-else>
          <template v-for="hit in shown(group.kind, group.hits)" :key="hit.key">
            <CoverCard
              v-if="hit.kind === 'albums'"
              :title="hit.album.title"
              :pinned-label="isPinnedAlbum(hit.album) ? t('pinned_mark') : null"
              :to="albumCardRoute(hit.album)"
              :cover="albumCover(hit.album, albumScope(hit.album))"
              :lines="albumLines(hit.album)"
              :open-label="t('open_item', { name: hit.album.title })"
              :play-label="t('play_item', { name: hit.album.title })"
              @play="playAlbumCard(hit.album)"
            />
            <CoverCard
              v-else-if="hit.kind === 'artists'"
              :title="hit.artist.name"
              :to="artistRoute(hit.artist.name)"
              artist
              :cover="artistImage(hit.artist.name)"
              :pinned-label="isPinnedArtist(hit.artist.name) ? t('pinned_mark') : null"
              :open-label="t('open_item', { name: hit.artist.name })"
              :play-label="hit.artist.literal ? t('play_item', { name: hit.artist.name }) : null"
              @play="playFrom({ kind: 'artist', artist: hit.artist.name })"
            />
            <CoverCard
              v-else-if="hit.kind === 'playlists'"
              :title="hit.list.name"
              :to="hit.list.to"
              :lines="[{ text: hitLine(hit) }]"
              :open-label="t('open_item', { name: hit.list.name })"
              :play-label="t('play_item', { name: hit.list.name })"
              @play="playFrom(hit.list.play)"
            />
          </template>
        </CoverGrid>
      </section>
    </template>
  </CollectionGate>
</template>
