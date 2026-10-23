<script setup lang="ts">
/**
 * Artist detail: the albums this artist is credited on, their own first and
 * then the ones they appear on through a joint credit ("A; B", kept by stock
 * as one artist). Years come from the files' tags where known, newest first.
 * Above them, the artist's most played tracks from the service's play history
 * (owner, 2026-09-29), each played within its album.
 */
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import CoverCard from '../components/collection/CoverCard.vue'
import CoverCardSkeleton from '../components/collection/CoverCardSkeleton.vue'
import CoverGrid from '../components/collection/CoverGrid.vue'
import DetailHeading from '../components/collection/DetailHeading.vue'
import SectionHeading from '../components/common/SectionHeading.vue'
import TrackTiles from '../components/track/TrackTiles.vue'
import { albumScope, recentAlbums, type Album } from '../domain/album'
import { creditLabel, credits } from '../domain/artist'
import { mostPlayed } from '../domain/history'
import { groupsNotOnCard, popularTracksOnCard, similarArtistsOnCard } from '../domain/recommendations'
import type { Track } from '../domain/track'
import type { SelectionTarget } from '../gateway/selection'
import { t } from '../i18n'
import { albumCover, albumYear, coverFor } from '../stores/enrichment'
import ArtistImageDialog from '../layout/ArtistImageDialog.vue'
import {
  artistBackground,
  artistImage,
  artistImagesAllowed,
  artistPictures,
  lookUpArtistImagesAutomatically,
  missingAutoImages,
} from '../stores/artistPictures'
import { history, loadHistory } from '../stores/history'
import { albums, artists, tracks } from '../stores/library'
import { isPinnedArtist, pins, togglePinArtist } from '../stores/pins'
import { nowIsPlaying as isPlaying, nowPlaying } from '../stores/output'
import { openInfoPanel, openTrackMenu, showCover, ui } from '../stores/ui'
import { artistList, autoPlaylists, makeArtistList, removeAutoList } from '../stores/autoPlaylists'
import { pairing } from '../stores/pairing'
import UiCircleButton from '../ui/UiCircleButton.vue'
import UiPillButton from '../ui/UiPillButton.vue'
import { albumIdentity, artistIdentity } from '../stores/musicbrainzIds'
import { albumIdentityKey } from '../stores/coverSearch'
import {
  artistRecommendations,
  lookUpArtistRecommendations,
  recommendationsAllowed,
  recommendationsAutomatic,
} from '../stores/recommendations'
import { albumCardRoute, albumRoute, artistAlbumLines, artistRoute, withYear } from './captions'
import { useCrumbs } from './crumbs'
import CollectionGate from './CollectionGate.vue'
import { useHeadingAction } from './headingAction'
import { playAlbumCard, playFrom } from './playAlbum'
import { toggleCurrent } from './trackRows'

const route = useRoute()
const name = computed(() => String(route.params.name ?? ''))
useCrumbs(() => [{ text: t('artists'), to: '/artists' }, { text: creditLabel(name.value) }])
/** The artist's automatic playlist, if the player keeps one. */
const kept = computed(() => artistList(name.value))
async function toggleKept(): Promise<void> {
  const list = kept.value
  if (!list) await makeArtistList(name.value)
  else if (confirm(t('auto_remove_confirm', { name: list.name }))) await removeAutoList(list)
}
/** The artist's picture in full size, when there is one (never the sleeve). */
function showArtistPicture(): void {
  const picture = artistImage(name.value)
  if (picture) showCover(picture, name.value)
}
const byId = computed(() => new Map(tracks.value.map((track) => [track.id, track])))

/** How this artist is credited on an album: as its (track or album) artist, jointly, or not. */
function role(album: Album): 'own' | 'joint' | null {
  let joint = false
  for (const id of album.ids) {
    const track = byId.value.get(id)
    if (!track) continue
    if (track.artist === name.value || track.albumArtist === name.value) return 'own'
    if (credits(track.artist, name.value)) joint = true
  }
  return joint ? 'joint' : null
}
/** The artist's own release scope, when stock can address it (a literal track artist). */
const scopeOf = (album: Album) => (album.trackArtists.includes(name.value) ? name.value : albumScope(album))
const byYear = (list: Album[]) =>
  recentAlbums(list).sort((a, b) => (albumYear(b, scopeOf(b)) ?? 0) - (albumYear(a, scopeOf(a)) ?? 0))
const own = computed(() => byYear(albums.value.filter((album) => role(album) === 'own')))
const appears = computed(() => byYear(albums.value.filter((album) => role(album) === 'joint')))
const items = own
const joined = appears

/** Stock plays an artist it knows by that exact name (not one known only from joint credits). */
const playable = computed(() => artists.value.some((artist) => artist.name === name.value && artist.literal))
const heading = useHeadingAction({
  owns: (track) => credits(track.artist, name.value),
  label: () => t('play_item', { name: creditLabel(name.value) }),
  disabled: () => false,
  play: () => void playFrom({ kind: 'artist', artist: name.value }),
})
/** The artist's most played tracks (each at most once), from the service's play history. */
const HOT = 6
const hot = computed(() =>
  mostPlayed(
    tracks.value.filter((track) => credits(track.artist, name.value)),
    history.most,
    HOT,
  ),
)
onMounted(() => {
  if (!history.loaded) void loadHistory()
})
/** A hot track plays within its album, from itself (stock cannot start an artist at one track). */
function hotTarget(track: Track): SelectionTarget {
  const key = { title: track.title, artist: track.artist }
  if (track.album && track.artist) return { kind: 'artistAlbum', artist: track.artist, album: track.album, track: key }
  if (track.album) return { kind: 'album', album: track.album, track: key }
  return { kind: 'library', track: key }
}
const current = computed(() => nowPlaying.value.track?.path ?? null)
const hotTitleTo = (track: Track) => (track.album ? albumRoute(track.album, track.artist || null) : null)
/** Under a hot track: its album when the track is this artist's alone, the credit when shared. */
const hotSubtitle = (track: Track) =>
  track.artist === name.value && track.album ? { text: track.album, to: hotTitleTo(track) } : null

/*
 * What MusicBrainz says of the artist once its id is confirmed (owner, 2026-10-01): type, country and
 * years beside the album count; the rest is in the details panel (i).
 */
const identity = computed(() => artistIdentity(name.value))
/*
 * The artist's photo and wide background (2026-09-29; chosen among the allowed sources, 2026-10-01),
 * credited in the details panel. A source that works automatically fills what the artist lacks of the images
 * the automatic lookups take (2026-10-02: a background only when the owner asks for it).
 */
watch(
  () =>
    artistImagesAllowed() && artistPictures.loaded && name.value && missingAutoImages(name.value).length
      ? `${name.value}\u0000${missingAutoImages(name.value).join(',')}`
      : null,
  (missing) => {
    if (missing) void lookUpArtistImagesAutomatically(name.value)
  },
  { immediate: true },
)

function lines(album: Album) {
  return withYear(artistAlbumLines(album, name.value), albumYear(album, scopeOf(album)))
}

/*
 * What ListenBrainz says of the identified artist (owner, 2026-10-23): its tracks on the card by the world's
 * listen counts, the similar artists the card holds and those it lacks, and the albums it lacks. Read by itself
 * when the source works automatically, else on a click; nothing without the artist's confirmed id.
 */
const POPULAR = 6
const SIMILAR_SHOWN = 12
const ABSENT_SHOWN = 8
const LACKING_SHOWN = 8
const recommended = computed(() => artistRecommendations(name.value))
/** The source may be asked for this artist: it is allowed and the artist is identified. */
const canRecommend = computed(() => identity.value !== null && recommendationsAllowed())
watch(
  () => (canRecommend.value && recommendationsAutomatic() && !recommended.value ? name.value : null),
  (artist) => {
    if (artist) void lookUpArtistRecommendations(artist)
  },
  { immediate: true },
)
const popular = computed(() =>
  recommended.value?.status === 'ready'
    ? popularTracksOnCard(
        recommended.value.recordings,
        tracks.value.filter((track) => credits(track.artist, name.value)),
        POPULAR,
      )
    : [],
)
const popularTracks = computed(() => popular.value.map((item) => item.track))
const similar = computed(() =>
  recommended.value?.status === 'ready'
    ? similarArtistsOnCard(
        recommended.value.similar,
        artists.value.map((artist) => artist.name),
        (artist) => artistIdentity(artist)?.mbid ?? null,
      )
    : { onCard: [], absent: [] },
)
const similarOnCard = computed(() => similar.value.onCard.slice(0, SIMILAR_SHOWN))
const similarAbsent = computed(() =>
  similar.value.absent
    .slice(0, ABSENT_SHOWN)
    .map((artist) => artist.name)
    .join(', '),
)
const lacking = computed(() =>
  recommended.value?.status === 'ready'
    ? groupsNotOnCard(
        recommended.value.groups,
        [...own.value, ...appears.value],
        (album) => albumIdentity(albumIdentityKey(album, scopeOf(album)))?.group ?? null,
        LACKING_SHOWN,
      )
    : [],
)
const lackingLine = (group: { name: string; date: string | null }) =>
  [group.name, group.date && /^\d{4}/.test(group.date) ? group.date.slice(0, 4) : null].filter(Boolean).join(' · ')
/** ListenBrainz answered, but nothing of it meets the card. */
const recommendedNothing = computed(
  () =>
    recommended.value?.status === 'ready' &&
    !recommended.value.tokenNeeded &&
    !popular.value.length &&
    !similar.value.onCard.length &&
    !similar.value.absent.length &&
    !lacking.value.length,
)
</script>

<template>
  <CollectionGate :count="items.length + joined.length">
    <template #heading="{ loading }">
      <DetailHeading
        :title="creditLabel(name)"
        :kind="t('kind_artist')"
        :verified="identity ? t('heading_verified') : null"
        artist
        :cover="artistImage(name)"
        :backdrop="artistBackground(name)"
        :sticky-action="loading || !playable ? null : heading.action.value"
        @cover="showArtistPicture"
        @sticky="heading.run"
      >
        <template #sticky>{{ t('album_count', { count: own.length }) }}</template>
        <template #meta>
          <span v-if="loading" class="inline-block h-10 w-90 animate-pulse rounded-4 bg-soft align-middle" />
          <!-- Type, country and years are in the details (i), not repeated here (owner, 2026-10-02). -->
          <template v-else>{{ t('album_count', { count: own.length }) }}</template>
        </template>
        <UiPillButton
          v-if="playable"
          icon="play"
          data-testid="play-artist"
          :disabled="loading"
          @click="playFrom({ kind: 'artist', artist: name })"
          >{{ t('play_artist') }}</UiPillButton
        >
        <UiCircleButton
          v-if="pins.available && name"
          icon="pin"
          :label="t(isPinnedArtist(name) ? 'unpin' : 'pin')"
          data-testid="pin-artist"
          :pressed="isPinnedArtist(name)"
          :disabled="pins.busy"
          @click="togglePinArtist(name)"
        />
        <UiCircleButton
          v-if="name"
          icon="info"
          :label="t('info_open')"
          data-testid="info-open"
          :pressed="ui.panel === 'info' && ui.panelInfo?.kind === 'artist' && ui.panelInfo.name === name"
          @click="openInfoPanel({ kind: 'artist', name }, $event.currentTarget as HTMLElement)"
        />
      </DetailHeading>
      <ArtistImageDialog />
    </template>
    <template #skeleton>
      <CoverGrid><CoverCardSkeleton v-for="n in 4" :key="n" /></CoverGrid>
    </template>
    <section v-if="hot.length" :aria-label="t('hot_tracks')" data-testid="hot-tracks">
      <SectionHeading :title="t('hot_tracks')" class="mt-0!">
        <!-- The artist's most played as an automatic playlist the player keeps (owner, 2026-09-30). -->
        <UiPillButton
          v-if="autoPlaylists.available"
          variant="secondary"
          icon="playlist"
          :aria-pressed="kept !== null"
          :aria-label="kept ? t('auto_kept_remove', { name: kept.name }) : undefined"
          :disabled="autoPlaylists.busy || !pairing.paired"
          data-testid="artist-auto"
          @click="toggleKept"
          >{{ kept ? t('auto_kept') : t('auto_keep') }}</UiPillButton
        >
      </SectionHeading>
      <TrackTiles
        :tracks="hot"
        :play-label="t('play_label')"
        :menu-label="t('track_actions')"
        :cover-of="coverFor"
        :current-path="current"
        :playing="isPlaying"
        :toggle-current="toggleCurrent"
        :pause-label="t('pause')"
        :title-to="hotTitleTo"
        :subtitle-of="hotSubtitle"
        :artist-to="artistRoute"
        @play="(index) => hot[index] && playFrom(hotTarget(hot[index]))"
        @menu="(index, anchor) => hot[index] && openTrackMenu(hot[index], hotTarget(hot[index]), anchor)"
      />
    </section>
    <section v-if="popular.length" :aria-label="t('popular_tracks')" data-testid="popular-tracks">
      <SectionHeading :title="t('popular_tracks')" :subtitle="t('popular_by')" :class="{ 'mt-0!': !hot.length }" />
      <TrackTiles
        :tracks="popularTracks"
        :play-label="t('play_label')"
        :menu-label="t('track_actions')"
        :cover-of="coverFor"
        :current-path="current"
        :playing="isPlaying"
        :toggle-current="toggleCurrent"
        :pause-label="t('pause')"
        :title-to="hotTitleTo"
        :subtitle-of="hotSubtitle"
        :artist-to="artistRoute"
        @play="(index) => popularTracks[index] && playFrom(hotTarget(popularTracks[index]))"
        @menu="
          (index, anchor) =>
            popularTracks[index] && openTrackMenu(popularTracks[index], hotTarget(popularTracks[index]), anchor)
        "
      />
    </section>
    <template
      v-for="(section, index) in [
        { title: t('albums'), list: items },
        { title: t('appears_on'), list: joined },
      ]"
      :key="section.title"
    >
      <section v-if="section.list.length" :aria-label="section.title">
        <SectionHeading :title="section.title" :class="{ 'mt-0!': !hot.length && (index === 0 || !items.length) }" />
        <CoverGrid>
          <CoverCard
            v-for="album in section.list"
            :key="album.key"
            :title="album.title"
            :to="albumCardRoute(album, scopeOf(album))"
            :cover="albumCover(album, scopeOf(album))"
            :lines="lines(album)"
            :open-label="t('open_item', { name: album.title })"
            :play-label="t('play_item', { name: album.title })"
            @play="playAlbumCard(album, scopeOf(album))"
          />
        </CoverGrid>
      </section>
    </template>
    <section
      v-if="canRecommend && (!recommended || recommended.status !== 'ready' || recommendedNothing)"
      :aria-label="t('recommend_title')"
      data-testid="recommend-state"
    >
      <SectionHeading :title="t('recommend_title')" />
      <p v-if="!recommended" class="m-0 text-footnote text-secondary">
        <UiPillButton variant="secondary" data-testid="recommend-ask" @click="lookUpArtistRecommendations(name)">{{
          t('recommend_ask')
        }}</UiPillButton>
      </p>
      <p v-else-if="recommended.status === 'loading'" role="status" class="m-0 text-footnote text-secondary">
        {{ t('recommend_asking') }}
      </p>
      <p
        v-else-if="recommended.status === 'failed'"
        class="m-0 flex flex-wrap items-center gap-12 text-footnote text-secondary"
      >
        {{ t('recommend_failed') }}
        <UiPillButton variant="secondary" data-testid="recommend-retry" @click="lookUpArtistRecommendations(name)">{{
          t('identify_retry')
        }}</UiPillButton>
      </p>
      <p v-else class="m-0 text-footnote text-secondary">{{ t('recommend_nothing') }}</p>
    </section>
    <section
      v-if="similarOnCard.length || similarAbsent"
      :aria-label="t('similar_artists')"
      data-testid="similar-artists"
    >
      <SectionHeading :title="t('similar_artists')" :subtitle="t('similar_by')" />
      <CoverGrid v-if="similarOnCard.length">
        <CoverCard
          v-for="artist in similarOnCard"
          :key="artist.name"
          :title="artist.name"
          :to="artistRoute(artist.name)"
          artist
          :cover="artistImage(artist.name)"
          :open-label="t('open_item', { name: artist.name })"
        />
      </CoverGrid>
      <p
        v-if="similarAbsent"
        class="mb-0 text-footnote text-secondary"
        :class="similarOnCard.length ? 'mt-16' : 'mt-0'"
        data-testid="similar-absent"
      >
        {{ t('similar_absent', { names: similarAbsent }) }}
      </p>
    </section>
    <section
      v-if="lacking.length"
      :aria-label="t('lacking_albums', { name: creditLabel(name) })"
      data-testid="lacking-albums"
    >
      <SectionHeading :title="t('lacking_albums', { name: creditLabel(name) })" :subtitle="t('lacking_by')" />
      <ul class="m-0 grid list-none gap-6 p-0 text-footnote text-secondary">
        <li v-for="group in lacking" :key="group.mbid">{{ lackingLine(group) }}</li>
      </ul>
    </section>
    <p
      v-if="recommended?.status === 'ready' && recommended.tokenNeeded"
      class="mt-18 mb-0 text-footnote text-secondary"
      data-testid="recommend-token"
    >
      {{ t('recommend_token') }}
      <RouterLink to="/settings?part=sources" class="text-ink underline underline-offset-2">{{
        t('recommend_token_link')
      }}</RouterLink>
    </p>
  </CollectionGate>
</template>
