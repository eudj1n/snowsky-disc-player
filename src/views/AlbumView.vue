<script setup lang="ts">
/**
 * Album detail. The route carries the album title and, optionally, one
 * literal track artist (reference album scope): a scoped page lists and plays
 * only that artist's release (stock type 7), so albums that share a title stay
 * apart. An unscoped title group with several artists offers the artists as
 * filters instead of guessing an album artist. "More by" shelves follow. A
 * joint album ("A; B") shows the pair's other albums, else its first
 * artist's, and then its artists (owner, round 14).
 */
import { isolateName } from '../domain/scripts'
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CoverCard from '../components/collection/CoverCard.vue'
import CoverRow from '../components/collection/CoverRow.vue'
import DetailHeading from '../components/collection/DetailHeading.vue'
import SectionHeading from '../components/common/SectionHeading.vue'
import TrackList from '../components/track/TrackList.vue'
import TrackListSkeleton from '../components/track/TrackListSkeleton.vue'
import { albumScope, albumTracks, albumsBy, byTrackNumber, discOf, recentAlbums } from '../domain/album'
import { creditArtists, creditLabel, creditSeparator, leadCredit, sameCredit } from '../domain/artist'
import type { SelectionTarget, TrackKey } from '../gateway/selection'
import { t } from '../i18n'
import { albumCover, albumCoverState, albumQuality, albumYear } from '../stores/enrichment'
import {
  coverLookupAllowed,
  coverSearch,
  coverSearchKey,
  dismissCover,
  lookUpCoverAutomatically,
  saveCover,
} from '../stores/coverSearch'
import AlbumCoverDialog from '../layout/AlbumCoverDialog.vue'
import { isHiRes, qualityLabel } from '../domain/quality'
import { formatBadge } from '../domain/track'
import { findGenre, playableGenre, sameGenre } from '../domain/genre'
import { artistImage } from '../stores/artistPictures'
import { albums, artists, genres, titleGroups, tracks as collection } from '../stores/library'
import { connection } from '../stores/connection'
import { isPinnedAlbum, pins, togglePinAlbum } from '../stores/pins'
import { openInfoPanel, openPlaylistDialog, openTrackMenu, openTrackPanel, showCover, ui } from '../stores/ui'
import UiCircleButton from '../ui/UiCircleButton.vue'
import UiHiResBadge from '../ui/UiHiResBadge.vue'
import UiPillButton from '../ui/UiPillButton.vue'
import UiTextButton from '../ui/UiTextButton.vue'
import { albumCardRoute, albumRoute, artistRoute, genreRoute, withYear } from './captions'
import { useCrumbs } from './crumbs'
import CollectionGate from './CollectionGate.vue'
import { onRowFavorite, onRowUnfavorite, trackRowProps } from './trackRows'
import { useHeadingAction } from './headingAction'
import { playAlbumCard, playFrom } from './playAlbum'

const MORE_BY_ARTISTS = 3
const CHIP =
  'rounded-20 border border-line px-15 py-8 text-footnote text-muted hover:text-ink aria-[current=page]:border-chip-on aria-[current=page]:bg-chip-on aria-[current=page]:text-chip-on-ink'

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
/** The genre as shown, and the spelling stock plays for this album (the one most of its tracks carry). */
const genreShown = computed(() =>
  genre.value ? (findGenre(genres.value, genre.value)?.name ?? genre.value.trim()) : null,
)
const genreLiteral = computed(() => {
  const found = genre.value ? findGenre(genres.value, genre.value) : null
  return found ? playableGenre(tracks.value, found) : null
})
const group = computed(() => titleGroups.value.find((item) => item.title === name.value) ?? null)
const tracks = computed(() =>
  byTrackNumber(
    albumTracks(collection.value, name.value, scope.value).filter(
      (track) => genre.value === null || sameGenre(track.genre, genre.value),
    ),
  ),
)
/** Each artist once, joint credits ("A; B") split into their artists. */
const credits = computed(() => [
  ...new Set((scope.value ? [scope.value] : (group.value?.artists ?? [])).flatMap(creditArtists)),
])
/** The credit rows leave out: the one most tracks carry, else the heading's (a guest's rows keep theirs). */
const ownCredit = computed(
  () =>
    leadCredit(tracks.value.map((track) => track.artist)) ?? (credits.value.length ? credits.value.join(';') : null),
)
const year = computed(() => (group.value ? albumYear(group.value, scope.value) : null))
/*
 * A cover from Cover Art Archive for an album known to have none (2026-09-29):
 * offered, previewed in the sleeve, saved into its folder only on request.
 */
const coverOffered = computed(
  () =>
    connection.media &&
    coverLookupAllowed() &&
    group.value !== null &&
    albumCoverState(group.value, scope.value) === 'missing',
)
const searchHere = computed(() => group.value !== null && coverSearch.key === coverSearchKey(group.value, scope.value))
const sleeve = computed(() =>
  searchHere.value && coverSearch.cover ? coverSearch.cover : group.value ? albumCover(group.value, scope.value) : null,
)
const coverMessage = computed(() => {
  if (!searchHere.value) return null
  const release = coverSearch.release
  switch (coverSearch.status) {
    case 'searching':
      return t('cover_searching')
    case 'found':
      return release
        ? t(release.source === 'fanarttv' ? 'cover_found_fanart' : 'cover_found', {
            release: [release.title, release.artist, release.date?.slice(0, 4)]
              .filter((part): part is string => Boolean(part))
              .map(isolateName)
              .join(' · '),
          })
        : null
    case 'missing':
      return t('cover_missing')
    case 'unreachable':
      return t('cover_unreachable')
    case 'failed':
      return t('cover_failed')
    default:
      return null
  }
})
// Another album leaves the offer behind.
watch([group, scope], () => {
  if (coverSearch.key && !searchHere.value) dismissCover()
})
// The source works automatically: an album known to have no cover is looked up once its page opens.
watch(
  coverOffered,
  (offered) => {
    if (offered && group.value) lookUpCoverAutomatically(group.value, scope.value)
  },
  { immediate: true },
)
/** "FLAC 24/96" and whether it is Hi-Res, from the first track's file. */
const quality = computed(() => {
  const found = group.value ? albumQuality(group.value, scope.value) : null
  if (!found) return null
  const value = {
    format: formatBadge(found.path),
    sampleRate: found.sampleRate,
    bitDepth: found.bitDepth,
    bitRate: found.bitRate ?? null,
    dsd: false,
  }
  const label = qualityLabel(value)
  return { text: [value.format, label].filter(Boolean).join(' '), hiRes: isHiRes(value) }
})
/** Several releases share this title: offer their artists as filters (and the whole group). */
const releases = computed(() => albums.value.filter((album) => album.title === name.value).length)
/** What a pin keeps: the one release shown (its scope), or the title group (combined-008). */
const pinTarget = computed(() => {
  const candidates = albums.value.filter((album) => album.title === name.value)
  if (candidates.length === 1) return candidates[0] ?? null
  return candidates.find((album) => scope.value !== null && albumScope(album) === scope.value) ?? group.value
})
const choices = computed(() => {
  const artists = group.value?.trackArtists ?? []
  // One album with a guest on some tracks needs no filters; homonymous albums (or an open scope) do.
  return artists.length > 1 && (releases.value > 1 || scope.value !== null) ? artists : []
})
const items = computed(() => tracks.value)
/** The page's joint credit ("A; B"): its scope, or the only track artist of the title. */
const joint = computed(() => {
  const credit = scope.value ?? (group.value?.trackArtists.length === 1 ? group.value.trackArtists[0] : null)
  return credit && creditArtists(credit).length > 1 ? credit : null
})
const moreBy = computed(() => {
  const credit = joint.value
  if (credit) {
    // Other albums credited to the same artists together (not a guest track on
    // one artist's album); else the first artist's other albums.
    const together = recentAlbums(
      albums.value.filter(
        (album) => album.title !== name.value && album.artists.some((other) => sameCredit(other, credit)),
      ),
    )
    if (together.length) return [{ artist: credit, label: creditLabel(credit), albums: together }]
    const first = creditArtists(credit)[0] ?? credit
    const own = albumsBy(albums.value, first, name.value)
    return own.length ? [{ artist: first, label: first, albums: own }] : []
  }
  return [...new Set((scope.value ? [scope.value] : (group.value?.trackArtists ?? [])).flatMap(creditArtists))]
    .slice(0, MORE_BY_ARTISTS)
    .map((artist) => ({ artist, label: artist, albums: albumsBy(albums.value, artist, name.value) }))
    .filter((shelf) => shelf.albums.length > 0)
})
/** The artists of a joint album, each with their page (and play, when stock knows them alone). */
const members = computed(() => {
  const credit = joint.value
  if (!credit) return []
  return creditArtists(credit).map(
    (artist) =>
      artists.value.find((item) => item.name === artist) ?? {
        name: artist,
        albumCount: 0,
        trackCount: 0,
        literal: false,
        own: false,
      },
  )
})

function target(track?: TrackKey): SelectionTarget {
  const one = track ? { track } : {}
  if (scope.value) return { kind: 'artistAlbum', artist: scope.value, album: name.value, ...one }
  if (genre.value) return { kind: 'genreAlbum', genre: genreLiteral.value ?? genre.value, album: name.value, ...one }
  return { kind: 'album', album: name.value, ...one }
}
/** A shelf card opens the artist's own release when the artist is a literal track artist of it. */
const shelfScope = (album: { trackArtists: readonly string[] }, artist: string) =>
  album.trackArtists.includes(artist) ? artist : (album.trackArtists.find((other) => sameCredit(other, artist)) ?? null)
useCrumbs(() => [
  ...(genre.value
    ? [
        { text: t('genres'), to: '/genres' },
        { text: genreShown.value ?? genre.value, to: genreRoute(genre.value) },
      ]
    : [{ text: t('albums'), to: '/albums' }]),
  ...(scope.value ? [{ text: creditLabel(scope.value), to: artistRoute(scope.value) }] : []),
  { text: name.value },
])
const heading = useHeadingAction({
  owns: (track) => tracks.value.some((item) => item.path === track.path),
  label: () => t('play_album'),
  disabled: () => !tracks.value.length,
  play: () => void playFrom(target()),
})
const LINK = 'underline-offset-3 hover:text-ink hover:underline focus-visible:text-ink focus-visible:underline'
</script>

<template>
  <CollectionGate :count="items.length">
    <template #heading="{ loading }">
      <DetailHeading
        :title="name"
        :kind="t('kind_album')"
        :cover="sleeve"
        :sticky-action="loading ? null : heading.action.value"
        @cover="sleeve && showCover(sleeve, name)"
        @sticky="heading.run"
      >
        <template #sticky>
          <template v-for="(artist, index) in credits" :key="artist"
            >{{ creditSeparator(index, credits.length)
            }}<RouterLink :to="artistRoute(artist)" :class="LINK">{{ artist }}</RouterLink></template
          ><template v-if="year">{{ credits.length ? ' · ' : '' }}{{ year }}</template>
        </template>
        <template #meta>
          <template v-if="loading"
            ><span class="inline-block h-10 w-140 animate-pulse rounded-4 bg-soft align-middle"
          /></template>
          <template v-else>
            <template v-for="(artist, index) in credits" :key="artist"
              >{{ creditSeparator(index, credits.length)
              }}<RouterLink :to="artistRoute(artist)" :class="LINK">{{ artist }}</RouterLink></template
            >
            <template v-if="year"><span v-if="credits.length"> · </span>{{ year }}</template>
            <template v-if="quality">
              <span v-if="credits.length || year"> · </span><span data-testid="album-quality">{{ quality.text }}</span>
              <UiHiResBadge v-if="quality.hiRes" class="ml-6" />
            </template>
          </template>
        </template>
        <UiPillButton icon="play" :disabled="loading || !tracks.length" @click="playFrom(target())">{{
          t('play_album')
        }}</UiPillButton>
        <UiCircleButton
          icon="playlist"
          :label="t('add_to_playlist')"
          :disabled="loading || !tracks.length"
          @click="openPlaylistDialog({ mode: 'add', tracks: tracks.map((track) => ({ ...track })), title: name })"
        />

        <UiCircleButton
          v-if="pins.available && pinTarget"
          icon="pin"
          :label="t(isPinnedAlbum(pinTarget) ? 'unpin' : 'pin')"
          data-testid="pin-album"
          :pressed="isPinnedAlbum(pinTarget)"
          :disabled="pins.busy"
          @click="pinTarget && togglePinAlbum(pinTarget)"
        />
        <UiCircleButton
          v-if="group"
          icon="info"
          :label="t('info_open')"
          data-testid="info-open"
          :pressed="ui.panel === 'info' && ui.panelInfo?.kind === 'album' && ui.panelInfo.key === group.key"
          @click="
            group &&
            openInfoPanel(
              { kind: 'album', key: group.key, title: group.title, scope },
              $event.currentTarget as HTMLElement,
            )
          "
        />
      </DetailHeading>
      <AlbumCoverDialog :album="group" :scope="scope" />
      <section
        v-if="coverMessage"
        class="mb-24 flex flex-wrap items-center gap-12 rounded-12 border border-line bg-raised px-18 py-14"
        data-testid="cover-offer"
        :aria-label="t('cover_find')"
      >
        <p class="m-0 min-w-0 flex-1 text-footnote leading-[1.55] text-secondary" role="status">
          {{ coverMessage }}
          <span v-if="coverSearch.status === 'found' && coverSearch.replacing" class="block text-caption text-muted">{{
            t('cover_replace_note')
          }}</span>
          <span v-if="coverSearch.status === 'searching'" class="block text-caption text-muted">{{
            t('cover_note')
          }}</span>
        </p>
        <template v-if="coverSearch.status === 'found'">
          <UiPillButton
            variant="secondary"
            :disabled="coverSearch.saving"
            data-testid="cover-save"
            @click="group && saveCover(group, scope)"
            >{{ t(coverSearch.replacing ? 'cover_replace' : 'cover_save') }}</UiPillButton
          >
          <UiTextButton class="text-footnote" @click="dismissCover">{{ t('cover_dismiss') }}</UiTextButton>
        </template>
      </section>
      <nav
        v-if="!loading && choices.length"
        :aria-label="t('album_scope_label')"
        class="mb-24 rounded-12 border border-line bg-raised px-18 py-16"
      >
        <p class="m-0 text-footnote leading-[1.55] text-secondary">{{ t('album_scope_note') }}</p>
        <div class="mt-12 flex flex-wrap gap-6">
          <RouterLink :to="albumRoute(name)" :class="CHIP" :aria-current="scope === null ? 'page' : undefined">{{
            t('album_scope_all')
          }}</RouterLink>
          <!-- The chosen artist again clears the choice, like the All chip (owner, round 14). -->
          <RouterLink
            v-for="artist in choices"
            :key="artist"
            :to="scope === artist ? albumRoute(name) : albumRoute(name, artist)"
            :title="scope === artist ? t('album_scope_all') : undefined"
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
        <span class="mr-6 text-footnote text-secondary">{{ t('in_genre', { genre: genreShown ?? genre }) }}</span>
        <RouterLink :to="albumRoute(name)" :class="CHIP">{{ t('whole_album') }}</RouterLink>
        <RouterLink :to="genreRoute(genreShown ?? genre)" :class="CHIP">{{ genreShown }}</RouterLink>
      </nav>
    </template>
    <template #skeleton>
      <TrackListSkeleton :rows="8" lead="number" :lines="1" :album="false" actions />
    </template>
    <TrackList
      v-bind="trackRowProps"
      lead="number"
      :tracks="items"
      :own-credit="ownCredit"
      :show-album="false"
      :disc-of="discOf"
      :disc-label="(disc: number) => t('disc_number', { number: disc })"
      @menu="(index, anchor) => items[index] && openTrackMenu(items[index], target(items[index]), anchor)"
      @open="(index, anchor) => items[index] && openTrackPanel(items[index], target(items[index]), anchor)"
      @play="(index) => items[index] && playFrom(target(items[index]))"
      @favorite="onRowFavorite"
      @unfavorite="onRowUnfavorite"
    />
    <section v-for="shelf in moreBy" :key="shelf.artist" :aria-label="t('more_by', { artist: shelf.label })">
      <SectionHeading :title="t('more_by', { artist: shelf.label })">
        <UiTextButton icon="arrow" @click="router.push(artistRoute(shelf.artist))">{{ t('all_albums') }}</UiTextButton>
      </SectionHeading>
      <CoverRow :label="t('more_by', { artist: shelf.label })">
        <CoverCard
          v-for="album in shelf.albums"
          :key="album.key"
          role="listitem"
          :title="album.title"
          :to="albumCardRoute(album, shelfScope(album, shelf.artist))"
          :cover="albumCover(album, shelfScope(album, shelf.artist))"
          :lines="withYear([], albumYear(album, shelfScope(album, shelf.artist)))"
          :open-label="t('open_item', { name: album.title })"
          :play-label="t('play_item', { name: album.title })"
          @play="playAlbumCard(album, shelfScope(album, shelf.artist))"
        />
      </CoverRow>
    </section>
    <section v-if="members.length" :aria-label="t('on_this_album')">
      <SectionHeading :title="t('on_this_album')" />
      <CoverRow :label="t('on_this_album')">
        <CoverCard
          v-for="artist in members"
          :key="artist.name"
          role="listitem"
          :title="artist.name"
          :to="artistRoute(artist.name)"
          artist
          :cover="artistImage(artist.name)"
          :lines="artist.albumCount ? [{ text: t('album_count', { count: artist.albumCount }) }] : []"
          :open-label="t('open_item', { name: artist.name })"
          :play-label="artist.literal ? t('play_item', { name: artist.name }) : null"
          @play="playFrom({ kind: 'artist', artist: artist.name })"
        />
      </CoverRow>
    </section>
  </CollectionGate>
</template>
