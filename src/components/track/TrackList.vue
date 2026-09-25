<script setup lang="ts">
/**
 * Reference track list: number (or play button), sleeve, title and artist,
 * album, duration and the track actions button. The album column can be
 * left out (album pages), and album and duration disappear when no row knows
 * them (stock rows often lack both). Rows are separated by quiet dividers.
 */
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { formatDuration, type Track } from '../../domain/track'
import UiIcon from '../../ui/UiIcon.vue'
import UiNowPlaying from '../../ui/UiNowPlaying.vue'
import Artwork from '../artwork/Artwork.vue'
import TrackListHeader from './TrackListHeader.vue'
import { ROW_DIVIDER, TRACK_ROW, trackColumns, type TrackColumnLabels } from './trackGrid'

const props = withDefaults(
  defineProps<{
    tracks: readonly Track[]
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
    /** Route for a row's artist, or null to keep it plain. */
    artistTo?: (track: Track) => RouteLocationRaw | null
    /** Route for a row's album, or null to keep it plain. */
    albumTo?: (track: Track) => RouteLocationRaw | null
  }>(),
  {
    showAlbum: true,
    currentPath: null,
    playing: false,
    playLabel: null,
    menuLabel: null,
    disabled: false,
    coverOf: () => null,
    header: null,
    artistTo: () => null,
    albumTo: () => null,
  },
)
const emit = defineEmits<{ play: [index: number]; menu: [index: number, anchor: HTMLElement] }>()
const LINK = 'hover:text-ink hover:underline hover:underline-offset-3 focus-visible:text-ink focus-visible:underline'
const isCurrent = (track: Track) => props.currentPath !== null && track.path === props.currentPath
const album = computed(() => props.showAlbum && props.tracks.some((track) => track.album))
const duration = computed(() => props.tracks.some((track) => formatDuration(track.durationMs)))
const columns = computed(() => trackColumns(album.value, duration.value, props.menuLabel !== null))

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
    <TrackListHeader v-if="header" :labels="header" :album="album" :duration="duration" :actions="menuLabel !== null" />
    <div
      v-for="(track, index) in tracks"
      :key="`${track.path ?? ''}#${index}`"
      role="row"
      class="group/row min-h-59 hover:bg-soft"
      :aria-current="isCurrent(track) ? 'true' : undefined"
      :class="[TRACK_ROW, ROW_DIVIDER, columns, { 'bg-selected hover:bg-selected': isCurrent(track) }]"
      @contextmenu="contextMenu($event, index)"
    >
      <span role="cell" class="flex justify-center text-10 text-muted">
        <button
          v-if="playLabel"
          type="button"
          :aria-label="`${playLabel} ${track.title}`"
          :disabled="disabled"
          class="grid size-24 place-items-center p-0 text-secondary hover:enabled:text-ink"
          @click="emit('play', index)"
        >
          <template v-if="isCurrent(track)">
            <UiNowPlaying :playing="playing" class="text-progress-fill group-hover/row:hidden" />
            <UiIcon name="play" class="hidden size-15 group-hover/row:block" />
          </template>
          <UiIcon v-else name="play" class="size-15" />
        </button>
        <UiNowPlaying v-else-if="isCurrent(track)" :playing="playing" class="text-progress-fill" />
        <template v-else>{{ index + 1 }}</template>
      </span>
      <span role="cell" class="size-38 overflow-hidden rounded-6 phone:size-34"
        ><Artwork :title="track.title" :cover="coverOf(track)"
      /></span>
      <div role="cell" class="min-w-0">
        <strong class="block truncate font-[550]">{{ track.title }}</strong>
        <RouterLink
          v-if="track.artist && artistTo(track)"
          :to="artistTo(track) ?? ''"
          class="mt-5 block w-fit max-w-full truncate text-10 text-muted"
          :class="LINK"
          >{{ track.artist }}</RouterLink
        >
        <small v-else class="mt-5 block truncate text-10 text-muted">{{ track.artist || '—' }}</small>
      </div>
      <span v-if="album" role="cell" class="min-w-0 truncate text-10 text-muted phone:hidden">
        <RouterLink
          v-if="track.album && albumTo(track)"
          :to="albumTo(track) ?? ''"
          class="block w-fit max-w-full truncate"
          :class="LINK"
          >{{ track.album }}</RouterLink
        >
        <template v-else>{{ track.album || '—' }}</template>
      </span>
      <span v-if="duration" role="cell" class="text-right text-10 text-muted tabular-nums">{{
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
  </div>
</template>
