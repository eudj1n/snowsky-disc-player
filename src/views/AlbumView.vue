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
import { albumTracks, albumsBy, byTrackNumber, discOf } from '../domain/album'
import { creditArtists, creditLabel } from '../domain/artist'
import { filterBy } from '../domain/search'
import type { SelectionTarget, TrackKey } from '../gateway/selection'
import { t } from '../i18n'
import { albumCover, albumQuality, albumYear } from '../stores/enrichment'
import { isHiRes, qualityLabel } from '../domain/quality'
import { formatBadge } from '../domain/track'
import { albums, titleGroups, tracks as collection } from '../stores/library'
import { selection } from '../stores/selection'
import { openPlaylistDialog, openTrackMenu, ui } from '../stores/ui'
import UiPillButton from '../ui/UiPillButton.vue'
import UiTextButton from '../ui/UiTextButton.vue'
import { albumCardRoute, albumRoute, artistRoute, genreRoute } from './captions'
import CollectionGate from './CollectionGate.vue'
import { onRowFavorite, onRowUnfavorite, trackRowProps } from './trackRows'
import { playAlbumCard, playFrom } from './playAlbum'

const MORE_BY_ARTISTS = 3
const CHIP =
  'rounded-20 border border-line px-15 py-8 text-11 text-muted hover:text-ink aria-[current=page]:border-chip-on aria-[current=page]:bg-chip-on aria-[current=page]:text-chip-on-ink'

const route = useRoute()
const router = useRouter()
const name = computed(() => String(route.params.name ?? ''))
const scope = computed(() => {
  const artist = route.params.artist
  return typeof artist === 'string' && artist !== '' ? artist : null
})
/** A genre scope from the genre page (`?genre=`), used only without an artist scope. */
const genre = computed(() => {
  const value = route.query.genre
  return scope.value === null && typeof value === 'string' && value !== '' ? value : null
})
const group = computed(() => titleGroups.value.find((item) => item.title === name.value) ?? null)
const tracks = computed(() =>
  byTrackNumber(
    albumTracks(collection.value, name.value, scope.value).filter(
      (track) => genre.value === null || track.genre === genre.value,
    ),
  ),
)
/** Each artist once, joint credits ("A; B") split into their artists. */
const credits = computed(() => [
  ...new Set((scope.value ? [scope.value] : (group.value?.artists ?? [])).flatMap(creditArtists)),
])
const year = computed(() => (group.value ? albumYear(group.value, scope.value) : null))
/** "FLAC 24/96" and whether it is Hi-Res, from the first track's file. */
const quality = computed(() => {
  const found = group.value ? albumQuality(group.value, scope.value) : null
  if (!found) return null
  const value = {
    format: formatBadge(found.path),
    sampleRate: found.sampleRate,
    bitDepth: found.bitDepth,
    bitRate: null,
    dsd: false,
  }
  const label = qualityLabel(value)
  return { text: [value.format, label].filter(Boolean).join(' '), hiRes: isHiRes(value) }
})
/** Several releases share this title: offer their artists as filters (and the whole group). */
const releases = computed(() => albums.value.filter((album) => album.title === name.value).length)
const choices = computed(() => {
  const artists = group.value?.trackArtists ?? []
  // One album with a guest on some tracks needs no filters; homonymous albums (or an open scope) do.
  return artists.length > 1 && (releases.value > 1 || scope.value !== null) ? artists : []
})
const searching = computed(() => ui.query.trim() !== '')
const items = computed(() => filterBy(tracks.value, ui.query, (track) => [track.title, track.artist, track.album]))
const moreBy = computed(() =>
  [...new Set((scope.value ? [scope.value] : (group.value?.trackArtists ?? [])).flatMap(creditArtists))]
    .slice(0, MORE_BY_ARTISTS)
    .map((artist) => ({ artist, albums: albumsBy(albums.value, artist, name.value) }))
    .filter((shelf) => shelf.albums.length > 0),
)

function target(track?: TrackKey): SelectionTarget {
  const one = track ? { track } : {}
  if (scope.value) return { kind: 'artistAlbum', artist: scope.value, album: name.value, ...one }
  if (genre.value) return { kind: 'genreAlbum', genre: genre.value, album: name.value, ...one }
  return { kind: 'album', album: name.value, ...one }
}
/** A shelf card opens the artist's own release when the artist is a literal track artist of it. */
const shelfScope = (album: { trackArtists: readonly string[] }, artist: string) =>
  album.trackArtists.includes(artist) ? artist : null
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
            <span v-if="credits.length"> · </span><template v-if="year">{{ year }} · </template
            >{{ t('track_count', { count: tracks.length }) }}
            <template v-if="quality">
              · <span data-testid="album-quality">{{ quality.text }}</span>
              <span
                v-if="quality.hiRes"
                class="ml-4 rounded-5 bg-accent px-6 py-2 align-middle text-10 font-semibold tracking-[1px] text-white"
                >Hi-Res</span
              >
            </template>
          </template>
        </template>
        <UiPillButton icon="play" :disabled="loading || !tracks.length || selection.busy" @click="playFrom(target())">{{
          t('play_album')
        }}</UiPillButton>
        <UiPillButton
          icon="playlist"
          variant="secondary"
          :disabled="loading || !tracks.length"
          @click="openPlaylistDialog({ mode: 'add', tracks: tracks.map((track) => ({ ...track })), title: name })"
          >{{ t('add_to_playlist') }}</UiPillButton
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
            >{{ creditLabel(artist) }}</RouterLink
          >
        </div>
      </nav>
      <nav
        v-if="!loading && genre"
        :aria-label="t('genre_filter')"
        class="mb-24 flex flex-wrap items-center gap-6 rounded-12 border border-line bg-raised px-18 py-14"
      >
        <span class="mr-6 text-12 text-secondary">{{ t('in_genre', { genre }) }}</span>
        <RouterLink :to="albumRoute(name)" :class="CHIP">{{ t('whole_album') }}</RouterLink>
        <RouterLink :to="genreRoute(genre)" :class="CHIP">{{ genre }}</RouterLink>
      </nav>
    </template>
    <template #skeleton>
      <TrackListSkeleton :rows="8" lead="number" :lines="1" :album="false" actions />
    </template>
    <TrackList
      v-bind="trackRowProps"
      lead="number"
      :tracks="items"
      :show-album="false"
      :disc-of="discOf"
      :disc-label="(disc: number) => t('disc_number', { number: disc })"
      @menu="(index, anchor) => items[index] && openTrackMenu(items[index], target(items[index]), anchor)"
      @play="(index) => items[index] && playFrom(target(items[index]))"
      @favorite="onRowFavorite"
      @unfavorite="onRowUnfavorite"
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
          :key="album.key"
          role="listitem"
          :title="album.title"
          :to="albumCardRoute(album, shelfScope(album, shelf.artist))"
          :cover="albumCover(album, shelfScope(album, shelf.artist))"
          :lines="[{ text: t('track_count', { count: album.trackCount }) }]"
          :open-label="t('open_item', { name: album.title })"
          :play-label="t('play_item', { name: album.title })"
          :play-disabled="selection.busy"
          @play="playAlbumCard(album, shelfScope(album, shelf.artist))"
        />
      </CoverRow>
    </section>
  </CollectionGate>
</template>
