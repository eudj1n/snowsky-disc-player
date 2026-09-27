<script setup lang="ts">
/**
 * Compact track grid for discovery sections: cover with a play overlay,
 * title, artist and the ⋯ actions, in three columns on desktop, two on
 * tablets and one on phones, separated by quiet dividers. The title opens
 * the track's album and the artist their page when the view supplies routes.
 * The current track's cover pauses or resumes it when the view can toggle.
 */
import { creditLabel } from '../../domain/artist'
import type { RouteLocationRaw } from 'vue-router'
import { sameTrack, type Track } from '../../domain/track'
import UiIcon from '../../ui/UiIcon.vue'
import UiNowPlaying from '../../ui/UiNowPlaying.vue'
import Artwork from '../artwork/Artwork.vue'
import ArtistCredit from './ArtistCredit.vue'

const props = withDefaults(
  defineProps<{
    tracks: readonly Track[]
    playLabel: string
    menuLabel: string
    coverOf?: (track: Track) => Blob | null
    currentPath?: string | null
    /** The current track's title and CUE flag, which tell a CUE sheet's tracks apart. */
    currentTitle?: string | null
    currentCue?: boolean
    playing?: boolean
    disabled?: boolean
    /** Route for the title (usually the album), or null to keep it plain. */
    titleTo?: (track: Track) => RouteLocationRaw | null
    /** Route for one artist of the credit, or null to keep it plain. */
    artistTo?: (name: string) => RouteLocationRaw | null
    toggleCurrent?: (() => void) | null
    pauseLabel?: string | null
  }>(),
  {
    coverOf: () => null,
    currentPath: null,
    currentTitle: null,
    currentCue: false,
    playing: false,
    disabled: false,
    titleTo: () => null,
    artistTo: () => null,
    toggleCurrent: null,
    pauseLabel: null,
  },
)
const emit = defineEmits<{ play: [index: number]; menu: [index: number, anchor: HTMLElement] }>()
// A CUE sheet's tracks share one file: its title tells them apart.
const isCurrent = (track: Track) =>
  props.currentPath !== null &&
  sameTrack(track, { path: props.currentPath, title: props.currentTitle ?? '', cue: props.currentCue })
const toggles = (track: Track) => props.toggleCurrent !== null && isCurrent(track)
const pauses = (track: Track) => toggles(track) && props.playing
const leadLabel = (track: Track) => `${(pauses(track) ? props.pauseLabel : null) ?? props.playLabel} ${track.title}`
function activate(track: Track, index: number): void {
  if (toggles(track)) props.toggleCurrent?.()
  else emit('play', index)
}
const LINK = 'hover:underline hover:underline-offset-3 focus-visible:underline'
</script>

<template>
  <ul
    class="m-0 grid list-none grid-flow-row grid-cols-3 gap-x-28 p-0 compact:gap-x-20 rail:grid-cols-2 phone:grid-cols-1 phone:[&>li:nth-child(n+7)]:hidden"
  >
    <li
      v-for="(track, index) in tracks"
      :key="`${track.path ?? ''}#${index}`"
      class="group/tile grid min-w-0 grid-cols-[44px_minmax(0,1fr)_27px] items-center gap-12 border-t border-line/70 py-8"
      :aria-current="isCurrent(track) ? 'true' : undefined"
      @contextmenu.prevent="
        emit('menu', index, ($event.currentTarget as HTMLElement).querySelector('[data-track-menu]') as HTMLElement)
      "
    >
      <button
        type="button"
        :aria-label="leadLabel(track)"
        :disabled="disabled"
        class="relative size-44 overflow-hidden rounded-6 p-0"
        @click="activate(track, index)"
      >
        <Artwork :title="track.title" :cover="coverOf(track)" />
        <span
          class="absolute inset-0 grid place-items-center bg-[#0006] text-white opacity-0 transition-opacity duration-200 group-focus-within/tile:opacity-100 group-hover/tile:opacity-100"
          :class="{ 'bg-[#0004] opacity-100': isCurrent(track) }"
        >
          <template v-if="isCurrent(track)">
            <UiNowPlaying :playing="playing" class="group-focus-within/tile:hidden group-hover/tile:hidden" />
            <UiIcon
              filled
              :name="pauses(track) ? 'pause' : 'play'"
              class="hidden size-16 group-focus-within/tile:block group-hover/tile:block"
              :class="{ '!stroke-[2.6]': pauses(track) }"
            />
          </template>
          <UiIcon v-else filled name="play" class="size-16" />
        </span>
      </button>
      <span class="min-w-0">
        <RouterLink
          v-if="titleTo(track)"
          :to="titleTo(track) ?? ''"
          class="block w-fit max-w-full truncate text-12 font-[550]"
          :class="LINK"
          >{{ track.title }}</RouterLink
        >
        <strong v-else class="block truncate text-12 font-[550]">{{ track.title }}</strong>
        <span v-if="track.artist && artistTo(track.artist)" class="mt-3 block max-w-full truncate text-11 text-muted">
          <ArtistCredit :credit="track.artist" :to="artistTo" :link-class="`hover:text-ink ${LINK}`" />
        </span>
        <small v-else class="mt-3 block truncate text-11 text-muted">{{
          track.artist ? creditLabel(track.artist) : '—'
        }}</small>
      </span>
      <button
        type="button"
        data-track-menu
        :aria-label="`${menuLabel}: ${track.title}`"
        aria-haspopup="menu"
        class="grid size-27 place-items-center rounded-full text-24 leading-none font-light text-secondary hover:bg-hover hover:text-ink"
        @click="emit('menu', index, $event.currentTarget as HTMLElement)"
      >
        ⋯
      </button>
    </li>
  </ul>
</template>
