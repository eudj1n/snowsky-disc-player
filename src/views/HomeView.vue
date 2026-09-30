<script setup lang="ts">
/**
 * Reference Home: intro, hero with the featured album, the albums played last
 * (stock's play history; hidden while it is empty), "Your albums", recent
 * tracks and the "Room for music" note. With a search query it
 * becomes an album list, as in the reference.
 */
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import CoverCard from '../components/collection/CoverCard.vue'
import CoverCardSkeleton from '../components/collection/CoverCardSkeleton.vue'
import CoverGrid from '../components/collection/CoverGrid.vue'
import CoverRow from '../components/collection/CoverRow.vue'
import SectionHeading from '../components/common/SectionHeading.vue'
import HomeHero from '../components/home/HomeHero.vue'
import HomeIntro from '../components/home/HomeIntro.vue'
import SourceTile from '../components/home/SourceTile.vue'
import ListeningNote from '../components/home/ListeningNote.vue'
import TrackList from '../components/track/TrackList.vue'
import TrackListSkeleton from '../components/track/TrackListSkeleton.vue'
import { recentAlbums, albumScope } from '../domain/album'
import { creditLabel } from '../domain/artist'
import { recentlyPlayedAlbums } from '../domain/history'
import { t } from '../i18n'
import { connection } from '../stores/connection'
import { autoPlaylists } from '../stores/autoPlaylists'
import ForYouSection from './ForYouSection.vue'
import { albumCover } from '../stores/enrichment'
import { history, loadHistory, recentSourcesShown } from '../stores/history'
import { isDisliked } from '../stores/disliked'
import { albums, featuredAlbum, tracks } from '../stores/library'
import { isPinnedAlbum, pins } from '../stores/pins'
import { openTrackMenu, openTrackPanel } from '../stores/ui'
import UiTextButton from '../ui/UiTextButton.vue'
import { albumCardRoute, albumLines, artistRoute } from './captions'
import CollectionGate from './CollectionGate.vue'
import { sourceTile } from './sourceTiles'
import { onRowFavorite, onRowUnfavorite, trackRowProps } from './trackRows'
import { playAlbumAction, playFrom, playAlbumCard } from './playAlbum'

const router = useRouter()
const recent = computed(() => recentAlbums(albums.value, 4))
const featured = featuredAlbum
// Disliked tracks stay off the shelves (combined-008).
const recentTracks = computed(() =>
  tracks.value
    .filter((track) => !isDisliked(track))
    .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
    .slice(0, 3),
)
/** Pinned albums (newest pin first) and artists, from the service's store (combined-008). */
const pinnedAlbums = computed(() =>
  [...pins.albums]
    .sort((a, b) => b.at - a.at)
    .flatMap((pin) => {
      const exact = albums.value.filter((album) => album.key === pin.album)
      // A title pinned as a whole group: every release of that title.
      return exact.length ? exact : albums.value.filter((album) => JSON.stringify([album.title]) === pin.album)
    }),
)
const pinnedArtists = computed(() => [...pins.artists].sort((a, b) => b.at - a.at).map((pin) => pin.name))
const played = computed(() => recentlyPlayedAlbums(history.recent, albums.value, tracks.value, 8))
/** The service's history (next image): the sources the listener started. */
const tiles = computed(() =>
  recentSourcesShown.value.flatMap(({ source, path }) => {
    const tile = sourceTile(source, path)
    return tile ? [tile] : []
  }),
)
onMounted(() => void loadHistory())
const heroLines = computed<[string, string]>(() =>
  featured.value
    ? [
        `${featured.value.title}${featured.value.artists[0] ? ` — ${creditLabel(featured.value.artists[0])}` : ''}.`,
        t('press_play_everything_else_can_wait'),
      ]
    : [t('your_favorite_records_all_in_one_place'), t('let_music_into_your_day')],
)
</script>

<template>
  <CollectionGate :count="1">
    <template #heading="{ loading }">
      <HomeIntro
        :eyebrow="t('a_good_day_for_music')"
        :title="t('on_your_wavelength')"
        :note="t('just_your_collection')"
      />
      <HomeHero
        :label="t('album_from_your_collection')"
        :eyebrow="t('your_personal_collection')"
        :title-lines="[t('your_collection'), t('your_rhythm')]"
        :cover="featured ? albumCover(featured, albumScope(featured)) : null"
        :lines="heroLines"
        :featured="
          featured ? { title: featured.title, to: albumCardRoute(featured), credit: featured.artists[0] ?? null } : null
        "
        :artist-to="artistRoute"
        :action="t('play_album')"
        :action-disabled="!featured"
        :loading="loading"
        @play="featured && playAlbumAction(featured.title, albumScope(featured))"
      />
    </template>
    <template #skeleton>
      <SectionHeading :title="t('your_albums')" :subtitle="t('the_music_you_always_come_back_to')" />
      <CoverGrid home><CoverCardSkeleton v-for="n in 4" :key="n" /></CoverGrid>
      <div class="grid grid-cols-[1.6fr_1fr] gap-32 compact:grid-cols-[1.4fr_1fr] compact:gap-20 rail:grid-cols-1">
        <section>
          <SectionHeading :title="t('from_your_collection')" />
          <TrackListSkeleton :rows="3" actions />
        </section>
      </div>
    </template>
    <section v-if="pinnedAlbums.length || pinnedArtists.length" :aria-label="t('pinned_section')" data-testid="pinned">
      <SectionHeading :title="t('pinned_section')" />
      <CoverRow v-if="pinnedAlbums.length" :label="t('pinned_section')">
        <CoverCard
          v-for="album in pinnedAlbums"
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
      <ul v-if="pinnedArtists.length" class="m-0 mt-12 flex list-none flex-wrap gap-8 p-0" data-testid="pinned-artists">
        <li v-for="name in pinnedArtists" :key="name">
          <RouterLink
            :to="artistRoute(name)"
            class="block rounded-20 bg-soft px-14 py-7 text-footnote font-medium text-ink hover:bg-hover"
            >{{ creditLabel(name) }}</RouterLink
          >
        </li>
      </ul>
    </section>
    <!-- Combined-009: the service says when it could not write a play (a full card stopped the history once). -->
    <p
      v-if="connection.historyWrites === 'failing'"
      role="status"
      class="m-0 rounded-12 bg-soft px-14 py-10 text-footnote text-notice"
      data-testid="history-failing"
    >
      {{ t('history_writes_failing') }}
    </p>
    <!-- The service's history: what the listener started, one tile shape for every kind. -->
    <section v-if="tiles.length" :aria-label="t('recently_played')">
      <SectionHeading :title="t('recently_played')" :subtitle="t('recently_played_subtitle')" />
      <div
        role="list"
        :aria-label="t('recently_played')"
        class="grid grid-cols-4 gap-10 compact:grid-cols-3 rail:grid-cols-2 phone:gap-8 phone:[&>*:nth-child(n+5)]:hidden compact:[&>*:nth-child(n+7)]:hidden"
      >
        <SourceTile
          v-for="tile in tiles"
          :key="tile.key"
          :title="tile.title"
          :caption="tile.caption"
          :to="tile.to"
          :cover="tile.cover"
          :art="tile.art ?? null"
          :open-label="t('open_item', { name: tile.title })"
          :play-label="tile.play ? t('play_item', { name: tile.title }) : null"
          @play="tile.play && playFrom(tile.play)"
        />
      </div>
    </section>
    <section v-else-if="played.length" :aria-label="t('recently_played')">
      <SectionHeading :title="t('recently_played')" :subtitle="t('recently_played_subtitle')" />
      <CoverRow :label="t('recently_played')">
        <CoverCard
          v-for="album in played"
          :key="album.key"
          role="listitem"
          :title="album.title"
          :pinned-label="isPinnedAlbum(album) ? t('pinned_mark') : null"
          :to="albumCardRoute(album)"
          :cover="albumCover(album, albumScope(album))"
          :lines="albumLines(album)"
          :open-label="t('open_item', { name: album.title })"
          :play-label="t('play_item', { name: album.title })"
          @play="playAlbumCard(album)"
        />
      </CoverRow>
    </section>
    <!-- Combined-009: the automatic playlists, made for you (owner, 2026-09-30). -->
    <ForYouSection v-if="autoPlaylists.available" />
    <SectionHeading :title="t('your_albums')" :subtitle="t('the_music_you_always_come_back_to')">
      <UiTextButton icon="arrow" @click="router.push('/albums')">{{ t('all_albums') }}</UiTextButton>
    </SectionHeading>
    <CoverGrid v-if="recent.length" home>
      <CoverCard
        v-for="album in recent"
        :key="album.key"
        :title="album.title"
        :pinned-label="isPinnedAlbum(album) ? t('pinned_mark') : null"
        :to="albumCardRoute(album)"
        :cover="albumCover(album, albumScope(album))"
        :lines="albumLines(album)"
        :open-label="t('open_item', { name: album.title })"
        :play-label="t('play_item', { name: album.title })"
        @play="playAlbumCard(album)"
      />
    </CoverGrid>
    <p v-else class="text-footnote leading-[1.55] text-muted">{{ t('no_albums_in_your_library_yet') }}</p>
    <div class="grid grid-cols-[1.6fr_1fr] gap-32 compact:grid-cols-[1.4fr_1fr] compact:gap-20 rail:grid-cols-1">
      <section>
        <SectionHeading :title="t('from_your_collection')">
          <UiTextButton icon="arrow" @click="router.push('/tracks')">{{ t('all_tracks') }}</UiTextButton>
        </SectionHeading>
        <TrackList
          v-bind="trackRowProps"
          :tracks="recentTracks"
          @play="(index) => recentTracks[index] && playFrom({ kind: 'library', track: recentTracks[index] })"
          @menu="
            (index, anchor) =>
              recentTracks[index] &&
              openTrackMenu(recentTracks[index], { kind: 'library', track: recentTracks[index] }, anchor)
          "
          @open="
            (index, anchor) =>
              recentTracks[index] &&
              openTrackPanel(recentTracks[index], { kind: 'library', track: recentTracks[index] }, anchor)
          "
          @favorite="onRowFavorite"
          @unfavorite="onRowUnfavorite"
        />
      </section>
      <section class="rail:hidden">
        <SectionHeading :title="t('room_for_music')" />
        <ListeningNote
          :eyebrow="t('just_listen')"
          :title-lines="[t('less_noise'), t('more_music')]"
          :lines="[t('your_player_your_records'), t('everything_that_matters_right_here')]"
        />
      </section>
    </div>
  </CollectionGate>
</template>
