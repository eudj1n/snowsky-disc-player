<script setup lang="ts">
/**
 * What takes space on the card (owner, round 16): the used space split into
 * the measured music and other files, then formats, the largest albums and
 * artists, and possible duplicates. Read-only; every file is measured once
 * through the media route and remembered in this browser.
 */
import { computed, onMounted, ref, watch } from 'vue'
import Artwork from '../components/artwork/Artwork.vue'
import SectionHeading from '../components/common/SectionHeading.vue'
import CardTabs from '../components/card/CardTabs.vue'
import ViewHeading from '../components/common/ViewHeading.vue'
import type { Album } from '../domain/album'
import { cardSpace, formatBytes } from '../domain/device'
import { relativeFolder } from '../domain/files'
import { albumSpace, artistSpace, byFormat, cardUsage, duplicates, playsByPath, type FileFacts } from '../domain/space'
import { locale, t } from '../i18n'
import { connection } from '../stores/connection'
import { device, refreshDevice } from '../stores/device'
import { albumCover, enrichment, forgetSizes, wantSizes } from '../stores/enrichment'
import { history, loadHistory } from '../stores/history'
import { loadTrash, trash } from '../stores/trash'
import { albums, library, tracks } from '../stores/library'
import UiIcon from '../ui/UiIcon.vue'
import UiSkeleton from '../ui/UiSkeleton.vue'
import UiTextButton from '../ui/UiTextButton.vue'
import { albumCardRoute, albumLines, artistRoute, leadArtist } from './captions'
import { CARD_ROW } from './cardRows'
import CollectionGate from './CollectionGate.vue'

const ALBUM_ROWS = 12
const ARTIST_ROWS = 10
const DUPLICATE_ROWS = 8

const bytes = (value: number) => formatBytes(value, locale.value)
const percent = (part: number, whole: number) => (whole > 0 ? `${Math.max((part / whole) * 100, 0.5)}%` : '0%')

/** Distinct files of the library: a CUE sheet's tracks share one. */
const withPath = computed(() => [
  ...new Map(
    tracks.value.flatMap((track) => (track.path ? [[track.path, { path: track.path }] as const] : [])),
  ).values(),
])
const measuredFiles = computed(() =>
  withPath.value.flatMap((track) => {
    const file = enrichment.files[track.path]
    return file ? [file] : []
  }),
)
const music = computed(() => measuredFiles.value.reduce((sum, file) => sum + file.bytes, 0))
const measuring = computed(() => enrichment.pending > 0 && measuredFiles.value.length < withPath.value.length)
const complete = computed(() => measuredFiles.value.length >= withPath.value.length)

const usage = computed(() => cardUsage(device.facts?.card ?? null, music.value))
const level = computed(() => (device.facts?.card ? (cardSpace(device.facts.card)?.level ?? 'ok') : 'ok'))
const formats = computed(() => byFormat(measuredFiles.value))

const played = computed(() => playsByPath(history.plays))
const playsShown = computed(() => connection.history)
const since = computed(() =>
  played.value.since === null
    ? null
    : new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(played.value.since * 1000),
)

const files = computed<Readonly<Record<string, FileFacts>>>(() => enrichment.files)
const albumRows = computed(() => albumSpace(albums.value, tracks.value, files.value, played.value.counts))
const artistRows = computed(() => artistSpace(albumRows.value, leadArtist))
const duplicateRows = computed(() => duplicates(tracks.value, files.value))

const allAlbums = ref(false)
const allArtists = ref(false)
const allDuplicates = ref(false)
/** The album's credit as its cards show it: the artist (or pair) with a link, or "Various artists". */
function creditOf(album: Album) {
  const lines = albumLines(album)
  return lines.length > 1 ? (lines[0] ?? null) : null
}
const shownAlbums = computed(() =>
  (allAlbums.value ? albumRows.value : albumRows.value.slice(0, ALBUM_ROWS)).map((entry) => ({
    ...entry,
    credit: creditOf(entry.album),
  })),
)
const shownArtists = computed(() => (allArtists.value ? artistRows.value : artistRows.value.slice(0, ARTIST_ROWS)))
const shownDuplicates = computed(() =>
  allDuplicates.value ? duplicateRows.value : duplicateRows.value.slice(0, DUPLICATE_ROWS),
)
const largestAlbum = computed(() => albumRows.value[0]?.bytes ?? 0)
const largestArtist = computed(() => artistRows.value[0]?.bytes ?? 0)

/** A card folder without the mount point, as the owner sees it in storage mode. */
const cardFolder = (folder: string) => folder.replace(/^\/tmp\/sdcard\/?/, '') || '/'

const meta = computed(() => {
  const total = withPath.value.length
  if (!connection.media) return t('space_needs_media')
  const done = Math.min(measuredFiles.value.length, total)
  return t(measuring.value ? 'space_measuring' : 'space_measured', { done, total })
})

function measure(): void {
  wantSizes(withPath.value)
}
async function measureAgain(): Promise<void> {
  await forgetSizes()
  measure()
}

onMounted(() => {
  void refreshDevice()
  if (!history.loaded) void loadHistory()
  if (connection.trash) void loadTrash()
})
// The collection may arrive after the view opened (or change with a rescan).
watch(
  () => [library.status, connection.media, withPath.value.length] as const,
  ([status, media]) => {
    if (status === 'ready' && media) measure()
  },
  { immediate: true },
)
</script>

<template>
  <CollectionGate :count="withPath.length" :searching="false" empty-key="search_empty_tracks">
    <template #heading="{ loading }">
      <ViewHeading :eyebrow="t('your_player')" :title="t('card_section')" :meta="loading ? null : meta">
        <CardTabs current="space" :trash="connection.trash" />
      </ViewHeading>
    </template>
    <template #skeleton>
      <UiSkeleton class="h-120 rounded-14" />
    </template>

    <section class="rounded-14 bg-soft px-20 py-18 phone:px-16" data-testid="card-usage">
      <div class="flex flex-wrap items-baseline justify-between gap-x-16 gap-y-4">
        <strong class="text-15 font-semibold">
          {{
            usage
              ? t('card_used_of', { used: bytes(usage.total - usage.free), total: bytes(usage.total) })
              : bytes(music)
          }}
        </strong>
        <span v-if="usage" class="text-12" :class="level === 'ok' ? 'text-muted' : 'font-semibold text-accent'">
          {{ t('card_free_short', { free: bytes(usage.free) }) }}
        </span>
      </div>
      <div v-if="usage" class="mt-12 flex h-10 overflow-hidden rounded-full bg-progress-bg" aria-hidden="true">
        <span class="h-full bg-progress-fill" :style="{ width: percent(usage.music, usage.total) }" />
        <span class="h-full bg-muted/45" :style="{ width: percent(usage.other, usage.total) }" />
      </div>
      <ul class="m-0 mt-12 flex list-none flex-wrap gap-x-18 gap-y-6 p-0 text-11 text-muted">
        <li class="flex items-center gap-6">
          <span class="size-8 rounded-full bg-progress-fill" aria-hidden="true" />
          {{ t('space_music') }} ·
          <strong class="font-semibold text-ink" data-testid="music-bytes">{{ bytes(music) }}</strong>
        </li>
        <li v-if="usage" class="flex items-center gap-6" :title="t('space_other_note')">
          <span class="size-8 rounded-full bg-muted/45" aria-hidden="true" />
          {{ t('space_other') }} · <strong class="font-semibold text-ink">{{ bytes(usage.other) }}</strong>
        </li>
        <li v-if="usage" class="flex items-center gap-6">
          <span class="size-8 rounded-full border border-line bg-progress-bg" aria-hidden="true" />
          {{ t('space_free') }} · <strong class="font-semibold text-ink">{{ bytes(usage.free) }}</strong>
        </li>
        <li v-if="connection.trash && trash.listing?.bytes" class="flex items-center gap-6">
          <UiIcon name="trash" class="size-12! shrink-0" />
          <RouterLink
            to="/card/trash"
            class="underline-offset-3 hover:text-ink hover:underline"
            data-testid="space-trash"
            >{{ t('space_trash') }} ·
            <strong class="font-semibold text-ink">{{ bytes(trash.listing.bytes) }}</strong></RouterLink
          >
        </li>
      </ul>
      <p class="mt-12 mb-0 flex flex-wrap items-center gap-x-12 gap-y-4 text-11 text-muted">
        <span>{{ t('space_measure_note') }}</span>
        <UiTextButton v-if="connection.media && complete" class="text-11" @click="measureAgain">{{
          t('space_measure_again')
        }}</UiTextButton>
      </p>
    </section>

    <template v-if="formats.length">
      <SectionHeading :title="t('space_by_format')" />
      <ul class="m-0 grid list-none gap-2 p-0" data-testid="space-formats">
        <li
          v-for="format in formats"
          :key="format.label"
          class="grid grid-cols-[minmax(7rem,10rem)_1fr_auto] items-center gap-14 phone:grid-cols-[1fr_auto]"
          :class="[CARD_ROW, 'py-6']"
        >
          <span class="text-13 font-semibold"
            >{{ format.label }}
            <small class="ml-6 font-normal text-muted">{{ t('file_count', { count: format.files }) }}</small></span
          >
          <span class="h-6 overflow-hidden rounded-full bg-progress-bg phone:hidden" aria-hidden="true">
            <span class="block h-full rounded-full bg-progress-fill" :style="{ width: percent(format.bytes, music) }" />
          </span>
          <span class="text-right text-13 font-semibold tabular-nums">{{ bytes(format.bytes) }}</span>
        </li>
      </ul>
    </template>

    <template v-if="albumRows.length && music > 0">
      <SectionHeading
        :title="t('space_albums')"
        :subtitle="playsShown && since ? t('space_plays_since', { date: since }) : undefined"
      />
      <ol class="m-0 list-none p-0" data-testid="space-albums">
        <li
          v-for="entry in shownAlbums"
          :key="entry.album.key"
          class="flex items-center gap-14 border-b border-line py-9 last:border-b-0"
          :class="CARD_ROW"
        >
          <RouterLink
            :to="albumCardRoute(entry.album)"
            tabindex="-1"
            aria-hidden="true"
            class="group size-44 shrink-0 overflow-hidden rounded-6"
          >
            <Artwork :title="entry.album.title" :cover="albumCover(entry.album)" />
          </RouterLink>
          <div class="min-w-0 flex-1">
            <RouterLink :to="albumCardRoute(entry.album)" class="block truncate text-13 font-semibold hover:underline">
              {{ entry.album.title }}
            </RouterLink>
            <p class="m-0 mt-2 truncate text-11 text-muted">
              <template v-if="entry.credit">
                <RouterLink v-if="entry.credit.to" :to="entry.credit.to" class="hover:text-ink hover:underline">{{
                  entry.credit.text
                }}</RouterLink>
                <template v-else>{{ entry.credit.text }}</template>
                ·
              </template>
              {{ t('track_count', { count: entry.album.trackCount }) }}
              <template v-if="entry.formats.length"> · {{ entry.formats.join(', ') }}</template>
              <template v-if="playsShown">
                ·
                {{ entry.plays ? t('play_times', { count: entry.plays }) : t('space_not_played') }}
              </template>
            </p>
          </div>
          <span class="h-6 w-120 shrink-0 overflow-hidden rounded-full bg-progress-bg compact:w-80 phone:hidden">
            <span
              class="block h-full rounded-full bg-progress-fill"
              :style="{ width: percent(entry.bytes, largestAlbum) }"
            />
          </span>
          <span class="w-72 shrink-0 text-right text-13 font-semibold tabular-nums">
            {{ entry.measured ? bytes(entry.bytes) : '—' }}
          </span>
        </li>
      </ol>
      <UiTextButton v-if="albumRows.length > ALBUM_ROWS" class="mt-10 text-12" @click="allAlbums = !allAlbums">
        {{ allAlbums ? t('space_show_fewer') : t('space_show_all', { count: albumRows.length }) }}
      </UiTextButton>

      <SectionHeading :title="t('space_artists')" />
      <ol class="m-0 list-none p-0" data-testid="space-artists">
        <li
          v-for="artist in shownArtists"
          :key="artist.name ?? ''"
          class="flex items-center gap-14 border-b border-line py-9 last:border-b-0"
          :class="CARD_ROW"
        >
          <RouterLink
            v-if="artist.name"
            :to="artistRoute(artist.name)"
            tabindex="-1"
            aria-hidden="true"
            class="group size-44 shrink-0 overflow-hidden rounded-full"
          >
            <Artwork :title="artist.name" artist />
          </RouterLink>
          <span
            v-else
            class="grid size-44 shrink-0 place-items-center rounded-full bg-soft text-secondary"
            aria-hidden="true"
          >
            <UiIcon name="artist" class="size-18" />
          </span>
          <div class="min-w-0 flex-1">
            <RouterLink
              v-if="artist.name"
              :to="artistRoute(artist.name)"
              class="block truncate text-13 font-semibold hover:underline"
              >{{ artist.name }}</RouterLink
            >
            <span v-else class="block truncate text-13 font-semibold">{{ t('various_artists') }}</span>
            <p class="m-0 mt-2 text-11 text-muted">{{ t('album_count', { count: artist.albums }) }}</p>
          </div>
          <span class="h-6 w-120 shrink-0 overflow-hidden rounded-full bg-progress-bg compact:w-80 phone:hidden">
            <span
              class="block h-full rounded-full bg-progress-fill"
              :style="{ width: percent(artist.bytes, largestArtist) }"
            />
          </span>
          <span class="w-72 shrink-0 text-right text-13 font-semibold tabular-nums">{{ bytes(artist.bytes) }}</span>
        </li>
      </ol>
      <UiTextButton v-if="artistRows.length > ARTIST_ROWS" class="mt-10 text-12" @click="allArtists = !allArtists">
        {{ allArtists ? t('space_show_fewer') : t('space_show_all', { count: artistRows.length }) }}
      </UiTextButton>
    </template>

    <template v-if="music > 0">
      <SectionHeading :title="t('space_duplicates')" :subtitle="t('space_duplicates_hint')" />
      <ul v-if="duplicateRows.length" class="m-0 grid list-none gap-10 p-0" data-testid="space-duplicates">
        <li
          v-for="pair in shownDuplicates"
          :key="pair.copies[0].folder + pair.copies[1].folder"
          class="rounded-10 bg-soft px-14 py-11 transition-colors duration-150 hover:bg-hover"
        >
          <p class="m-0 text-12 font-semibold">{{ t('duplicate_tracks', { count: pair.tracks }) }}</p>
          <p v-for="copy in pair.copies" :key="copy.folder" class="m-0 mt-5 flex items-center gap-8 text-12 text-muted">
            <RouterLink
              :to="{ name: 'cardFiles', query: { folder: relativeFolder(copy.folder) } }"
              class="min-w-0 flex-1 truncate hover:text-ink hover:underline"
              :title="copy.folder"
              >{{ cardFolder(copy.folder) }}</RouterLink
            >
            <span v-if="copy.formats.length" class="shrink-0">{{ copy.formats.join(', ') }}</span>
            <span class="w-72 shrink-0 text-right font-semibold text-ink tabular-nums">{{
              copy.bytes ? bytes(copy.bytes) : '—'
            }}</span>
          </p>
        </li>
      </ul>
      <p v-else-if="complete" class="m-0 text-12 text-muted">{{ t('space_no_duplicates') }}</p>
      <UiTextButton
        v-if="duplicateRows.length > DUPLICATE_ROWS"
        class="mt-10 text-12"
        @click="allDuplicates = !allDuplicates"
      >
        {{ allDuplicates ? t('space_show_fewer') : t('space_show_all', { count: duplicateRows.length }) }}
      </UiTextButton>
    </template>
  </CollectionGate>
</template>
