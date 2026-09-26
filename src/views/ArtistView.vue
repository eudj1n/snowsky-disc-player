<script setup lang="ts">
/**
 * Artist detail: the albums this artist is credited on, their own first and
 * then the ones they appear on through a joint credit ("A; B", kept by stock
 * as one artist). Years come from the files' tags where known, newest first.
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CoverCard from '../components/collection/CoverCard.vue'
import CoverCardSkeleton from '../components/collection/CoverCardSkeleton.vue'
import CoverGrid from '../components/collection/CoverGrid.vue'
import DetailHeading from '../components/collection/DetailHeading.vue'
import SectionHeading from '../components/common/SectionHeading.vue'
import { albumScope, albumTracks, recentAlbums, type Album } from '../domain/album'
import { creditLabel, credits } from '../domain/artist'
import { filterBy } from '../domain/search'
import { t } from '../i18n'
import { albumCover, albumYear } from '../stores/enrichment'
import { albums, tracks } from '../stores/library'
import { selection } from '../stores/selection'
import { ui } from '../stores/ui'
import UiTextButton from '../ui/UiTextButton.vue'
import { albumCardRoute, albumLines, withYear } from './captions'
import CollectionGate from './CollectionGate.vue'
import { playAlbumCard } from './playAlbum'

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

function lines(album: Album) {
  const count = albumTracks(tracks.value, album.title, name.value).length
  const base = album.trackArtists.includes(name.value) ? [{ text: t('track_count', { count }) }] : albumLines(album)
  return withYear(base, albumYear(album, scopeOf(album)))
}
</script>

<template>
  <CollectionGate :count="items.length + joined.length" :searching="searching" empty-key="search_empty_albums">
    <template #heading="{ loading }">
      <UiTextButton class="text-12" @click="router.push('/artists')">← {{ t('back_to_collection') }}</UiTextButton>
      <DetailHeading :title="creditLabel(name)" artist>
        <template #meta>
          <span v-if="loading" class="inline-block h-10 w-90 animate-pulse rounded-4 bg-soft align-middle" />
          <template v-else>{{ t('album_count', { count: own.length }) }}</template>
        </template>
      </DetailHeading>
    </template>
    <template #skeleton>
      <CoverGrid><CoverCardSkeleton v-for="n in 4" :key="n" /></CoverGrid>
    </template>
    <template
      v-for="(section, index) in [
        { title: t('albums'), list: items },
        { title: t('appears_on'), list: joined },
      ]"
      :key="section.title"
    >
      <section v-if="section.list.length" :aria-label="section.title">
        <SectionHeading :title="section.title" :class="{ 'mt-0!': index === 0 || !items.length }" />
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
            :play-disabled="selection.busy"
            @play="playAlbumCard(album, scopeOf(album))"
          />
        </CoverGrid>
      </section>
    </template>
  </CollectionGate>
</template>
