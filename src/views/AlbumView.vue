<script setup lang="ts">
/** Album detail (stock title group): header with artist links, then its tracks. */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DetailHeading from '../components/collection/DetailHeading.vue'
import TrackList from '../components/track/TrackList.vue'
import TrackListSkeleton from '../components/track/TrackListSkeleton.vue'
import { filterBy } from '../domain/search'
import { t } from '../i18n'
import { albumCover, coverFor } from '../stores/enrichment'
import { albums, tracks as collection } from '../stores/library'
import { playback } from '../stores/playback'
import { selection } from '../stores/selection'
import { openTrackMenu, ui } from '../stores/ui'
import UiPillButton from '../ui/UiPillButton.vue'
import UiTextButton from '../ui/UiTextButton.vue'
import CollectionGate from './CollectionGate.vue'
import { playAlbumAction, playFrom } from './playAlbum'

const route = useRoute()
const router = useRouter()
const name = computed(() => String(route.params.name ?? ''))
const album = computed(() => albums.value.find((item) => item.title === name.value) ?? null)
const tracks = computed(() => collection.value.filter((track) => track.album === name.value))
const searching = computed(() => ui.query.trim() !== '')
const items = computed(() => filterBy(tracks.value, ui.query, (track) => [track.title, track.artist, track.album]))
</script>

<template>
  <CollectionGate :count="items.length" :searching="searching" empty-key="search_empty_tracks">
    <template #heading="{ loading }">
      <UiTextButton class="text-12" @click="router.push('/albums')">← {{ t('back_to_collection') }}</UiTextButton>
      <DetailHeading :title="name" :cover="albumCover(name)">
        <template #meta>
          <template v-if="loading"
            ><span class="inline-block h-10 w-140 animate-pulse rounded-4 bg-soft align-middle"
          /></template>
          <template v-else>
            <template v-for="(artist, index) in album?.artists ?? []" :key="artist">
              <RouterLink
                :to="{ name: 'artist', params: { name: artist } }"
                class="underline-offset-3 hover:text-ink hover:underline focus-visible:text-ink focus-visible:underline"
                >{{ artist }}</RouterLink
              ><span v-if="index < (album?.artists.length ?? 0) - 1"> · </span>
            </template>
            <span v-if="album?.artists.length"> · </span>{{ t('track_count', { count: tracks.length }) }}
          </template>
        </template>
        <UiPillButton
          icon="play"
          :disabled="loading || !tracks.length || selection.busy"
          @click="playAlbumAction(name)"
          >{{ t('play_album') }}</UiPillButton
        >
      </DetailHeading>
    </template>
    <template #skeleton>
      <TrackListSkeleton :rows="8" :album="false" actions />
    </template>
    <TrackList
      :tracks="items"
      :show-album="false"
      :current-path="playback.current.track?.path ?? null"
      :play-label="t('play_label')"
      :cover-of="coverFor"
      :disabled="selection.busy"
      :menu-label="t('track_actions')"
      @menu="
        (index, anchor) =>
          items[index] && openTrackMenu(items[index], { kind: 'album', album: name, track: items[index] }, anchor)
      "
      @play="(index) => items[index] && playFrom({ kind: 'album', album: name, track: items[index] })"
    />
  </CollectionGate>
</template>
