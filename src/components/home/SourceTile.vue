<script setup lang="ts">
/**
 * One thing the listener started, on the home "Recently played" shelf: the
 * same compact tile for an album, an artist, a genre, a playlist or the
 * favorites (owner, round 14: no mix of card shapes). Square picture, name, a
 * caption naming the kind; the tile opens it, the round button plays it where
 * the pointer can hover.
 */
import type { RouteLocationRaw } from 'vue-router'
import UiIcon from '../../ui/UiIcon.vue'
import Artwork from '../artwork/Artwork.vue'
import ListArt from '../artwork/ListArt.vue'

withDefaults(
  defineProps<{
    title: string
    caption: string
    to: RouteLocationRaw
    cover?: Blob | null
    /** An automatic playlist's cover background, in place of a cover (combined-009). */
    art?: string | null
    openLabel: string
    playLabel?: string | null
    playDisabled?: boolean
  }>(),
  { cover: null, art: null, playLabel: null, playDisabled: false },
)
const emit = defineEmits<{ play: [] }>()
</script>

<template>
  <article
    role="listitem"
    class="group/tile relative flex h-64 min-w-0 items-center overflow-hidden rounded-8 bg-soft transition-colors duration-150 hover:bg-hover phone:h-52"
  >
    <!-- Room for the play button only where it can appear (a pointer that hovers). -->
    <RouterLink
      :to="to"
      :aria-label="openLabel"
      class="flex h-full min-w-0 flex-1 items-center gap-12 pr-48 phone:gap-10 [@media(hover:none)]:pr-10"
    >
      <span class="size-64 shrink-0 overflow-hidden phone:size-52"
        ><ListArt v-if="art" :title="title" :background="art" thumb /><Artwork v-else :title="title" :cover="cover"
      /></span>
      <span class="min-w-0">
        <strong class="block truncate text-12 font-[600]">{{ title }}</strong>
        <small class="mt-3 block truncate text-10 text-muted">{{ caption }}</small>
      </span>
    </RouterLink>
    <button
      v-if="playLabel"
      type="button"
      :aria-label="playLabel"
      :title="playLabel"
      :disabled="playDisabled"
      class="absolute right-10 grid size-32 place-items-center rounded-full bg-strong p-0 text-strong-ink opacity-0 shadow-[0_4px_12px_#0002] transition-opacity duration-150 group-focus-within/tile:opacity-100 group-hover/tile:opacity-100 hover:enabled:bg-strong-hover [@media(hover:none)]:hidden"
      @click="emit('play')"
    >
      <UiIcon filled name="play" class="size-13 stroke-[1.5]" />
    </button>
  </article>
</template>
