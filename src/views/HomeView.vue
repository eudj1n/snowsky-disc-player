<script setup lang="ts">
/**
 * Reference Home: intro, hero with the featured album, "Your albums",
 * recent tracks and the "Room for music" note. With a search query it
 * becomes an album list, as in the reference.
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import CoverCard from '../components/collection/CoverCard.vue'
import CoverCardSkeleton from '../components/collection/CoverCardSkeleton.vue'
import CoverGrid from '../components/collection/CoverGrid.vue'
import SectionHeading from '../components/common/SectionHeading.vue'
import ViewHeading from '../components/common/ViewHeading.vue'
import HomeHero from '../components/home/HomeHero.vue'
import HomeIntro from '../components/home/HomeIntro.vue'
import ListeningNote from '../components/home/ListeningNote.vue'
import TrackList from '../components/track/TrackList.vue'
import TrackListSkeleton from '../components/track/TrackListSkeleton.vue'
import { recentAlbums } from '../domain/album'
import { filterBy } from '../domain/search'
import { t } from '../i18n'
import { albums, featuredAlbum, library } from '../stores/library'
import { selection } from '../stores/selection'
import { playback } from '../stores/playback'
import { openTrackMenu, ui } from '../stores/ui'
import UiTextButton from '../ui/UiTextButton.vue'
import { albumLines, albumRoute, countLine } from './captions'
import CollectionGate from './CollectionGate.vue'
import { playAlbumAction, playFrom } from './playAlbum'

const router = useRouter()
const searching = computed(() => ui.query.trim() !== '')
const recent = computed(() => recentAlbums(albums.value, 4))
const featured = featuredAlbum
const recentTracks = computed(() => [...library.tracks].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, 3))
const found = computed(() => filterBy(albums.value, ui.query, (album) => [album.title, ...album.artists]))
const heroLines = computed<[string, string]>(() =>
  featured.value
    ? [
        `${featured.value.title}${featured.value.artists[0] ? ` — ${featured.value.artists[0]}` : ''}.`,
        t('press_play_everything_else_can_wait'),
      ]
    : [t('your_favorite_records_all_in_one_place'), t('let_music_into_your_day')],
)
</script>

<template>
  <CollectionGate v-if="searching" :count="found.length" searching empty-key="search_empty_albums">
    <template #heading="{ loading }">
      <ViewHeading
        :eyebrow="t('my_collection')"
        :title="t('home')"
        :meta="loading ? null : countLine(true, found.length)"
      />
    </template>
    <template #skeleton>
      <CoverGrid><CoverCardSkeleton v-for="n in 8" :key="n" /></CoverGrid>
    </template>
    <CoverGrid>
      <CoverCard
        v-for="album in found"
        :key="album.title"
        :title="album.title"
        :to="albumRoute(album.title)"
        :lines="albumLines(album)"
        :open-label="t('open_item', { name: album.title })"
      />
    </CoverGrid>
  </CollectionGate>
  <CollectionGate v-else :count="1" :searching="false" empty-key="search_empty_albums">
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
        :lines="heroLines"
        :action="t('play_album')"
        :action-disabled="!featured || selection.busy"
        :loading="loading"
        @play="featured && playAlbumAction(featured.title)"
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
    <SectionHeading :title="t('your_albums')" :subtitle="t('the_music_you_always_come_back_to')">
      <UiTextButton icon="arrow" @click="router.push('/albums')">{{ t('all_albums') }}</UiTextButton>
    </SectionHeading>
    <CoverGrid v-if="recent.length" home>
      <CoverCard
        v-for="album in recent"
        :key="album.title"
        :title="album.title"
        :to="albumRoute(album.title)"
        :lines="albumLines(album)"
        :open-label="t('open_item', { name: album.title })"
      />
    </CoverGrid>
    <p v-else class="text-11 leading-[1.6] text-muted">{{ t('no_albums_in_your_library_yet') }}</p>
    <div class="grid grid-cols-[1.6fr_1fr] gap-32 compact:grid-cols-[1.4fr_1fr] compact:gap-20 rail:grid-cols-1">
      <section>
        <SectionHeading :title="t('from_your_collection')">
          <UiTextButton icon="arrow" @click="router.push('/tracks')">{{ t('all_tracks') }}</UiTextButton>
        </SectionHeading>
        <TrackList
          :tracks="recentTracks"
          :current-path="playback.current.track?.path ?? null"
          :play-label="t('play_label')"
          :disabled="selection.busy"
          :menu-label="t('track_actions')"
          @play="(index) => recentTracks[index] && playFrom({ kind: 'library', track: recentTracks[index] })"
          @menu="
            (index, anchor) =>
              recentTracks[index] &&
              openTrackMenu(recentTracks[index], { kind: 'library', track: recentTracks[index] }, anchor)
          "
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
