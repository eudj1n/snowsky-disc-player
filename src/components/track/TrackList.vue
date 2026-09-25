<script setup lang="ts">
/**
 * Reference track list: number (or play button), sleeve, title and artist,
 * album, duration and the track actions button. The album column can be
 * left out (album pages), and album and duration disappear when no row knows
 * them (stock rows often lack both). Rows are separated by quiet dividers.
 */
import { computed } from 'vue'
import { formatDuration, type Track } from '../../domain/track'
import UiIcon from '../../ui/UiIcon.vue'
import ArtworkSleeve from '../artwork/ArtworkSleeve.vue'
import { ROW_DIVIDER, TRACK_ROW, trackColumns } from './trackGrid'

const props = withDefaults(
  defineProps<{
    tracks: readonly Track[]
    showAlbum?: boolean
    currentPath?: string | null
    /** Rows get a play button that emits `play` with the row index. */
    playLabel?: string | null
    /** Rows get a ⋯ button (and a context menu) that emit `menu`. */
    menuLabel?: string | null
    disabled?: boolean
  }>(),
  { showAlbum: true, currentPath: null, playLabel: null, menuLabel: null, disabled: false },
)
const emit = defineEmits<{ play: [index: number]; menu: [index: number, anchor: HTMLElement] }>()
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
    <div
      v-for="(track, index) in tracks"
      :key="`${track.path ?? ''}#${index}`"
      role="row"
      class="min-h-59 hover:bg-soft"
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
          <UiIcon :name="isCurrent(track) ? 'music' : 'play'" class="size-15" />
        </button>
        <template v-else>{{ index + 1 }}</template>
      </span>
      <span role="cell" class="size-38 overflow-hidden rounded-6 phone:size-34"
        ><ArtworkSleeve :title="track.title"
      /></span>
      <div role="cell" class="min-w-0">
        <strong class="block truncate font-[550]">{{ track.title }}</strong>
        <small class="mt-5 block truncate text-10 text-muted">{{ track.artist || '—' }}</small>
      </div>
      <span v-if="album" role="cell" class="truncate text-10 text-muted phone:hidden">{{ track.album || '—' }}</span>
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
