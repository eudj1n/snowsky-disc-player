<script setup lang="ts">
/**
 * Reference track list: optional header row and rows with number, sleeve,
 * title/artist, album and duration. Album and duration columns disappear
 * when no row knows them (stock rows often lack both). With a play label
 * the number becomes a play button; the current row shows a note.
 */
import { computed } from 'vue'
import { formatDuration, type Track } from '../../domain/track'
import UiIcon from '../../ui/UiIcon.vue'
import ArtworkSleeve from '../artwork/ArtworkSleeve.vue'
import { TRACK_ROW, trackColumns } from './trackGrid'

const props = withDefaults(
  defineProps<{
    tracks: readonly Track[]
    header?: { title: string; album: string } | null
    currentPath?: string | null
    /** Rows get a play button that emits `play` with the row index. */
    playLabel?: string | null
    disabled?: boolean
  }>(),
  { header: null, currentPath: null, playLabel: null, disabled: false },
)
const emit = defineEmits<{ play: [index: number] }>()
const isCurrent = (track: Track) => props.currentPath !== null && track.path === props.currentPath
const album = computed(() => props.tracks.some((track) => track.album))
const duration = computed(() => props.tracks.some((track) => formatDuration(track.durationMs)))
const columns = computed(() => trackColumns(album.value, duration.value))
const rowClass = TRACK_ROW
</script>

<template>
  <div role="table">
    <div
      v-if="header"
      role="row"
      class="mb-5 min-h-30 rounded-none border-b border-line text-9 tracking-[1px] text-muted"
      :class="[rowClass, columns]"
    >
      <span role="columnheader" class="text-center">#</span>
      <span />
      <span role="columnheader">{{ header.title }}</span>
      <span v-if="album" role="columnheader" class="phone:hidden">{{ header.album }}</span>
      <span v-if="duration" role="columnheader" class="flex justify-end"><UiIcon name="clock" class="size-14" /></span>
    </div>
    <div
      v-for="(track, index) in tracks"
      :key="`${track.path ?? ''}#${index}`"
      role="row"
      class="min-h-59 hover:bg-soft"
      :class="[rowClass, columns, { 'bg-selected hover:bg-selected': isCurrent(track) }]"
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
    </div>
  </div>
</template>
