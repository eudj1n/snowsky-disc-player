<script setup lang="ts">
/**
 * Artist detail: the albums this artist is credited on, their own first and
 * then the ones they appear on through a joint credit ("A; B", kept by stock
 * as one artist). Years come from the files' tags where known, newest first.
 * Above them, the artist's most played tracks from the service's play history
 * (owner, 2026-09-29), each played within its album.
 */
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CoverCard from '../components/collection/CoverCard.vue'
import CoverCardSkeleton from '../components/collection/CoverCardSkeleton.vue'
import CoverGrid from '../components/collection/CoverGrid.vue'
import DetailHeading from '../components/collection/DetailHeading.vue'
import SectionHeading from '../components/common/SectionHeading.vue'
import TrackTiles from '../components/track/TrackTiles.vue'
import { albumScope, recentAlbums, type Album } from '../domain/album'
import { creditLabel, credits } from '../domain/artist'
import { mostPlayed } from '../domain/history'
import type { Track } from '../domain/track'
import type { SelectionTarget } from '../gateway/selection'
import { filterBy } from '../domain/search'
import { t } from '../i18n'
import { albumCover, albumYear, coverFor } from '../stores/enrichment'
import {
  artistImage,
  artistPhotosAllowed,
  artistPictures,
  forgetArtistPicture,
  lookUpArtistPicture,
} from '../stores/artistPictures'
import { history, loadHistory } from '../stores/history'
import { albums, artists, tracks } from '../stores/library'
import { isPinnedArtist, pins, togglePinArtist } from '../stores/pins'
import { isPlaying, playback } from '../stores/playback'
import { openTrackMenu, ui } from '../stores/ui'
import UiCircleButton from '../ui/UiCircleButton.vue'
import UiPillButton from '../ui/UiPillButton.vue'
import UiTextButton from '../ui/UiTextButton.vue'
import { albumCardRoute, albumRoute, artistAlbumLines, artistRoute, withYear } from './captions'
import CollectionGate from './CollectionGate.vue'
import { useHeadingAction } from './headingAction'
import { playAlbumCard, playFrom } from './playAlbum'
import { toggleCurrent } from './trackRows'

const route = useRoute()
const router = useRouter()
const name = computed(() => String(route.params.name ?? ''))
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
const searching = computed(() => ui.query.trim() !== '')
const match = (album: Album) => [album.title, ...album.artists]
const items = computed(() => filterBy(own.value, ui.query, match))
const joined = computed(() => filterBy(appears.value, ui.query, match))

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
  filterBy(
    mostPlayed(
      tracks.value.filter((track) => credits(track.artist, name.value)),
      history.most,
      HOT,
    ),
    ui.query,
    (track) => [track.title, track.album],
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
const current = computed(() => playback.current.track?.path ?? null)
const hotTitleTo = (track: Track) => (track.album ? albumRoute(track.album, track.artist || null) : null)
/** Under a hot track: its album when the track is this artist's alone, the credit when shared. */
const hotSubtitle = (track: Track) =>
  track.artist === name.value && track.album ? { text: track.album, to: hotTitleTo(track) } : null

/* A photo from Wikimedia Commons (2026-09-29): found on request, kept in this browser, credited. */
const picture = computed(() => artistPictures.pictures[name.value] ?? null)
const photoMessage = computed(() => {
  const search = artistPictures.search
  if (search.name !== name.value) return null
  if (search.status === 'searching') return t('photo_searching')
  if (search.status === 'missing') return t('photo_missing')
  if (search.status === 'failed') return t('photo_failed')
  return null
})

function lines(album: Album) {
  return withYear(artistAlbumLines(album, name.value), albumYear(album, scopeOf(album)))
}
</script>

<template>
  <CollectionGate :count="items.length + joined.length" :searching="searching" empty-key="search_empty_albums">
    <template #heading="{ loading }">
      <UiTextButton class="text-12" @click="router.push('/artists')">← {{ t('back_to_collection') }}</UiTextButton>
      <DetailHeading
        :title="creditLabel(name)"
        :kind="t('kind_artist')"
        artist
        :cover="artistImage(name)"
        :sticky-action="loading || !playable ? null : heading.action.value"
        @sticky="heading.run"
      >
        <template #sticky>{{ t('album_count', { count: own.length }) }}</template>
        <template #meta>
          <span v-if="loading" class="inline-block h-10 w-90 animate-pulse rounded-4 bg-soft align-middle" />
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
          v-if="artistPhotosAllowed() && name && !picture"
          icon="image"
          :label="t('photo_find')"
          data-testid="photo-find"
          :disabled="artistPictures.search.name === name && artistPictures.search.status === 'searching'"
          @click="lookUpArtistPicture(name)"
        />
      </DetailHeading>
      <p v-if="photoMessage" class="-mt-8 mb-20 text-12 text-secondary" role="status" data-testid="photo-status">
        {{ photoMessage }}
        <span v-if="artistPictures.search.status === 'searching'" class="block text-10 text-muted">{{
          t('photo_note')
        }}</span>
      </p>
      <p v-if="picture" class="-mt-8 mb-20 text-11 text-muted" data-testid="photo-credit">
        {{ t('photo_credit') }}:
        <a
          v-if="picture.page"
          :href="picture.page"
          target="_blank"
          rel="noopener noreferrer"
          class="text-secondary underline-offset-3 hover:text-ink hover:underline"
          >{{ picture.author ?? t('photo_source') }}</a
        ><template v-else>{{ picture.author ?? t('photo_source') }}</template
        ><template v-if="picture.license">
          ·
          <a
            v-if="picture.licenseUrl"
            :href="picture.licenseUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="underline-offset-3 hover:text-ink hover:underline"
            >{{ picture.license }}</a
          ><template v-else>{{ picture.license }}</template></template
        >
        · {{ t('photo_source') }} · {{ t('photo_kept') }}
        <UiTextButton
          class="ml-6 inline-flex! align-baseline text-11"
          data-testid="photo-remove"
          @click="forgetArtistPicture(name)"
          >{{ t('photo_remove') }}</UiTextButton
        >
      </p>
    </template>
    <template #skeleton>
      <CoverGrid><CoverCardSkeleton v-for="n in 4" :key="n" /></CoverGrid>
    </template>
    <section v-if="hot.length" :aria-label="t('hot_tracks')" data-testid="hot-tracks">
      <SectionHeading :title="t('hot_tracks')" class="mt-0!" />
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
  </CollectionGate>
</template>
