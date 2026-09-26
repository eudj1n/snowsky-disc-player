<script setup lang="ts">
/**
 * Track list. A row leads with its cover (Tracks, Favorites, playlists) or
 * its track number (album pages, where the album shares one cover); hovering
 * or focusing the row turns the lead into its play button, as on the New
 * tiles. The current track shows a pulsing dot there. A favorite heart sits
 * in the gutter left of the row (always shown for favorites, on hover
 * otherwise; a button only for the current track, the one the stock can
 * change). Then title and linked artist, the linked album, duration and the
 * actions button. Album and duration
 * columns disappear when no row knows them (stock rows often lack both).
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { formatDuration, type LibraryTrack, type Track } from '../../domain/track'
import UiIcon from '../../ui/UiIcon.vue'
import UiNowPlaying from '../../ui/UiNowPlaying.vue'
import Artwork from '../artwork/Artwork.vue'
import ArtistCredit from './ArtistCredit.vue'
import TrackListHeader from './TrackListHeader.vue'
import { HEART_LANE, ROW_DIVIDER, TRACK_ROW, trackColumns, type TrackColumnLabels, type TrackLead } from './trackGrid'

export interface FavoriteLabels {
  /** Row state for assistive technology. */
  favorite: string
  add: string
  remove: string
  /** Why other rows cannot be changed from here. */
  onlyCurrent: string
  /** Removing a favorite that is not playing. */
  removeAny: string
}

const props = withDefaults(
  defineProps<{
    tracks: readonly Track[]
    lead?: TrackLead
    showAlbum?: boolean
    currentPath?: string | null
    /** The current track is playing (its marker pulses) rather than paused. */
    playing?: boolean
    /** Rows get a play button that emits `play` with the row index. */
    playLabel?: string | null
    /** Rows get a ⋯ button (and a context menu) that emit `menu`. */
    menuLabel?: string | null
    disabled?: boolean
    /** Observed cover for a row, when known. */
    coverOf?: (track: Track) => Blob | null
    /** Column names for a muted header row (long lists); none by default. */
    header?: TrackColumnLabels | null
    /** Route for one artist of a row's credit, or null to keep it plain. */
    artistTo?: (name: string) => RouteLocationRaw | null
    /** A row's disc: headings separate the discs of a multi-disc album. */
    discOf?: ((track: Track) => number | null) | null
    discLabel?: (disc: number) => string
    /** Route for a row's album, or null to keep it plain. */
    albumTo?: (track: Track) => RouteLocationRaw | null
    /** Favorite state per row (null: unknown); the heart column needs labels too. */
    favoriteOf?: (track: Track) => boolean | null
    favoriteLabels?: FavoriteLabels | null
    /** The current track's favorite cannot be changed right now. */
    favoriteDisabled?: boolean
    /** Favorites that are not playing can be removed (catalog admits love/song). */
    favoriteRemovable?: boolean
  }>(),
  {
    lead: 'cover',
    showAlbum: true,
    currentPath: null,
    playing: false,
    playLabel: null,
    menuLabel: null,
    disabled: false,
    coverOf: () => null,
    header: null,
    artistTo: () => null,
    discOf: null,
    discLabel: (disc: number) => String(disc),
    albumTo: () => null,
    favoriteOf: () => null,
    favoriteLabels: null,
    favoriteDisabled: true,
    favoriteRemovable: false,
  },
)
const emit = defineEmits<{
  play: [index: number]
  menu: [index: number, anchor: HTMLElement]
  favorite: []
  unfavorite: [track: Track]
}>()
const LINK = 'hover:text-ink hover:underline hover:underline-offset-3 focus-visible:text-ink focus-visible:underline'
/** Shown on row hover or keyboard focus inside the row. */
const REVEAL = 'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100'
/** The heart lives in the page gutter, left of the row (owner's reference). */
const HEART =
  'absolute top-1/2 -left-32 grid size-22 -translate-y-1/2 place-items-center rounded-full p-0 transition-[opacity,transform,translate,scale,rotate,color] duration-150 compact:-left-27 listening:-left-30 phone:left-3 phone:size-18'
const isCurrent = (track: Track) => props.currentPath !== null && track.path === props.currentPath
const album = computed(() => props.showAlbum && props.tracks.some((track) => track.album))
const duration = computed(() => props.tracks.some((track) => formatDuration(track.durationMs)))
const columns = computed(() => trackColumns(props.lead, album.value, duration.value, props.menuLabel !== null))
/** Numbered album rows by one artist leave the artist out (owner's reference): shorter rows. */
const soloArtist = computed(
  () => props.lead === 'number' && new Set(props.tracks.map((track) => track.artist ?? '')).size <= 1,
)
/** Row index → disc heading, when the rows span more than one disc. */
const discHeadings = computed(() => {
  const headings = new Map<number, string>()
  const discOf = props.discOf
  if (!discOf) return headings
  const discs = props.tracks.map((track) => discOf(track))
  if (new Set(discs.filter((disc) => disc !== null)).size < 2) return headings
  discs.forEach((disc, index) => {
    if (disc !== null && disc !== discs[index - 1]) headings.set(index, props.discLabel(disc))
  })
  return headings
})
/**
 * Long lists render progressively (owner, round 10: ~700 tracks felt slow):
 * the first rows at once, the next batch whenever the end of the rendered part
 * comes within 800 px of the viewport. Rows keep their indexes, since only a
 * prefix of the same list is drawn.
 */
const BATCH = 60
const shown = ref(BATCH)
const rows = computed(() => props.tracks.slice(0, shown.value))
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
watch(sentinel, (element) => {
  observer?.disconnect()
  observer = null
  if (!element) return
  if (typeof IntersectionObserver !== 'function') {
    shown.value = Infinity
    return
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      shown.value += BATCH
      // Still in range after the batch (a tall window): observing again re-checks at once.
      void nextTick(() => {
        observer?.unobserve(element)
        if (sentinel.value === element) observer?.observe(element)
      })
    },
    { rootMargin: '800px 0px' },
  )
  observer.observe(element)
})
onBeforeUnmount(() => observer?.disconnect())

const numberOf = (track: Track, index: number) => {
  const number = (track as Partial<LibraryTrack>).trackNumber
  return typeof number === 'number' && number > 0 ? number : index + 1
}

function contextMenu(event: MouseEvent, index: number): void {
  if (props.menuLabel === null) return
  const row = event.currentTarget as HTMLElement
  const anchor = row.querySelector<HTMLElement>('[data-track-menu]')
  if (!anchor) return
  event.preventDefault()
  emit('menu', index, anchor)
}
</script>

<template>
  <div role="table">
    <TrackListHeader
      v-if="header"
      :labels="header"
      :lead="lead"
      :album="album"
      :duration="duration"
      :actions="menuLabel !== null"
      :heart-lane="favoriteLabels !== null"
    />
    <template v-for="(track, index) in rows" :key="`${track.path ?? ''}#${index}`">
      <div v-if="discHeadings.has(index)" role="row" class="pt-18 pb-6">
        <span role="rowheader" class="text-10 font-[650] tracking-[1.8px] text-muted uppercase">{{
          discHeadings.get(index)
        }}</span>
      </div>
      <div
        role="row"
        class="group/row hover:bg-soft"
        :data-solo="soloArtist"
        :aria-current="isCurrent(track) ? 'true' : undefined"
        :class="[
          TRACK_ROW,
          ROW_DIVIDER,
          columns,
          soloArtist ? 'min-h-46' : 'min-h-59',
          { 'bg-selected hover:bg-selected': isCurrent(track), [HEART_LANE]: favoriteLabels !== null },
        ]"
        @contextmenu="contextMenu($event, index)"
      >
        <span role="cell" class="flex justify-center">
          <template v-if="favoriteLabels && favoriteOf(track) !== null">
            <button
              v-if="isCurrent(track) && !favoriteDisabled"
              type="button"
              :aria-pressed="favoriteOf(track) === true"
              :aria-label="favoriteOf(track) ? favoriteLabels.remove : favoriteLabels.add"
              :title="favoriteOf(track) ? favoriteLabels.remove : favoriteLabels.add"
              class="text-muted hover:scale-110 hover:text-accent focus-visible:text-accent aria-pressed:text-accent aria-pressed:hover:text-accent/80 [&>svg]:transition-[fill,stroke] hover:[&>svg]:stroke-[2.2]"
              :class="[HEART, favoriteOf(track) ? '' : `${REVEAL} focus-visible:opacity-100`]"
              @click="emit('favorite')"
            >
              <UiIcon name="heart" class="size-12 phone:size-11" :filled="favoriteOf(track) === true" />
            </button>
            <button
              v-else-if="favoriteOf(track) && favoriteRemovable"
              type="button"
              aria-pressed="true"
              :aria-label="`${favoriteLabels.removeAny}: ${track.title}`"
              :title="favoriteLabels.removeAny"
              class="text-accent hover:scale-110 hover:text-accent/80"
              :class="HEART"
              @click="emit('unfavorite', track)"
            >
              <UiIcon name="heart" filled class="size-12 phone:size-11" />
            </button>
            <span v-else-if="favoriteOf(track)" class="text-accent" :class="HEART" :title="favoriteLabels.favorite">
              <UiIcon filled name="heart" class="size-12 phone:size-11" /><span class="sr-only">{{
                favoriteLabels.favorite
              }}</span>
            </span>
            <span
              v-else
              aria-hidden="true"
              class="cursor-help text-muted/70"
              :class="[HEART, REVEAL]"
              :title="favoriteLabels.onlyCurrent"
            >
              <UiIcon name="heart" class="size-12 phone:size-11" />
            </span>
          </template>
          <template v-if="lead === 'cover'">
            <button
              v-if="playLabel"
              type="button"
              :aria-label="`${playLabel} ${track.title}`"
              :disabled="disabled"
              class="relative size-40 overflow-hidden rounded-6 p-0 phone:size-34"
              @click="emit('play', index)"
            >
              <Artwork :title="track.title" :cover="coverOf(track)" />
              <span
                class="absolute inset-0 grid place-items-center bg-[#0006] text-white transition-opacity duration-200"
                :class="isCurrent(track) ? 'bg-[#0004] opacity-100' : REVEAL"
              >
                <template v-if="isCurrent(track)">
                  <UiNowPlaying :playing="playing" class="group-hover/row:hidden" />
                  <UiIcon filled name="play" class="hidden size-14 group-hover/row:block" />
                </template>
                <UiIcon v-else filled name="play" class="size-14" />
              </span>
            </button>
            <span v-else class="size-40 overflow-hidden rounded-6 phone:size-34"
              ><Artwork :title="track.title" :cover="coverOf(track)"
            /></span>
          </template>
          <button
            v-else-if="playLabel"
            type="button"
            :aria-label="`${playLabel} ${track.title}`"
            :disabled="disabled"
            class="grid h-24 w-full place-items-center p-0 text-11 text-muted tabular-nums hover:enabled:text-ink"
            @click="emit('play', index)"
          >
            <UiNowPlaying
              v-if="isCurrent(track)"
              :playing="playing"
              class="text-progress-fill group-focus-within/row:hidden group-hover/row:hidden"
            />
            <span v-else class="group-focus-within/row:hidden group-hover/row:hidden">{{
              numberOf(track, index)
            }}</span>
            <UiIcon
              filled
              name="play"
              class="hidden size-13 text-secondary group-focus-within/row:block group-hover/row:block"
            />
          </button>
          <span v-else class="text-11 text-muted tabular-nums">{{ numberOf(track, index) }}</span>
        </span>
        <div role="cell" class="min-w-0">
          <strong class="block truncate font-[550]">{{ track.title }}</strong>
          <template v-if="soloArtist" />
          <span
            v-else-if="track.artist && artistTo(track.artist)"
            class="mt-5 block max-w-full truncate text-11 text-muted"
          >
            <ArtistCredit :credit="track.artist" :to="artistTo" :link-class="LINK" />
          </span>
          <small v-else class="mt-5 block truncate text-11 text-muted">{{ track.artist || '—' }}</small>
        </div>
        <span v-if="album" role="cell" class="min-w-0 truncate text-11 text-muted phone:hidden">
          <RouterLink
            v-if="track.album && albumTo(track)"
            :to="albumTo(track) ?? ''"
            class="block w-fit max-w-full truncate"
            :class="LINK"
            >{{ track.album }}</RouterLink
          >
          <template v-else>{{ track.album || '—' }}</template>
        </span>
        <span v-if="duration" role="cell" class="text-right text-11 text-muted tabular-nums">{{
          formatDuration(track.durationMs) ?? '—:—'
        }}</span>
        <span v-if="menuLabel !== null" role="cell" class="flex justify-end">
          <button
            type="button"
            data-track-menu
            :aria-label="`${menuLabel}: ${track.title}`"
            aria-haspopup="menu"
            class="grid size-27 place-items-center rounded-full text-24 leading-none font-light tracking-[1px] text-secondary hover:bg-hover hover:text-ink"
            @click="emit('menu', index, $event.currentTarget as HTMLElement)"
          >
            ⋯
          </button>
        </span>
      </div>
    </template>
    <div v-if="rows.length < tracks.length" ref="sentinel" aria-hidden="true" class="h-1" />
  </div>
</template>
