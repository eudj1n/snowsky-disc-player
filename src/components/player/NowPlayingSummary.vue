<script setup lang="ts">
/** Left block of the player bar: cover, title and artist, favorite. The title
 * opens the track's album and the artist their page when routes are given. */
import type { RouteLocationRaw } from 'vue-router'
import Artwork from '../artwork/Artwork.vue'
import UiIconButton from '../../ui/UiIconButton.vue'

withDefaults(
  defineProps<{
    openLabel: string
    expanded: boolean
    title: string
    subtitle: string
    artworkTitle: string | null
    cover: Blob | null
    favoriteLabel: string
    favorite: boolean | null
    favoriteDisabled: boolean
    titleTo?: RouteLocationRaw | null
    subtitleTo?: RouteLocationRaw | null
  }>(),
  { titleTo: null, subtitleTo: null },
)
const emit = defineEmits<{ open: [opener: HTMLElement]; favorite: [] }>()
</script>

<template>
  <div class="flex min-w-0 items-center gap-12 phone:gap-10">
    <button
      type="button"
      :aria-label="openLabel"
      aria-controls="now-panel"
      :aria-expanded="expanded"
      class="shrink-0 rounded-8 p-0 outline-offset-3 hover:scale-[1.04] aria-expanded:outline-2 aria-expanded:outline-accent phone:rounded-7"
      @click="emit('open', $event.currentTarget as HTMLElement)"
    >
      <span class="block size-56 overflow-hidden rounded-8 bg-soft phone:size-44 phone:rounded-7">
        <Transition
          mode="out-in"
          enter-from-class="opacity-0 scale-[0.96]"
          enter-active-class="transition-[opacity,scale] duration-300 ease-out motion-reduce:transition-none"
          leave-active-class="transition-opacity duration-150 ease-in motion-reduce:transition-none"
          leave-to-class="opacity-0"
        >
          <Artwork :key="artworkTitle ?? 'none'" :title="artworkTitle" :cover="cover" />
        </Transition>
      </span>
    </button>
    <div class="min-w-0">
      <RouterLink
        v-if="titleTo"
        :to="titleTo"
        class="block w-fit max-w-full truncate text-11 font-[650] hover:underline hover:underline-offset-3 focus-visible:underline phone:text-10"
        data-testid="track-title"
        >{{ title }}</RouterLink
      >
      <strong v-else class="block truncate text-11 font-[650] phone:text-10" data-testid="track-title">{{
        title
      }}</strong>
      <RouterLink
        v-if="subtitleTo"
        :to="subtitleTo"
        class="mt-6 block w-fit max-w-full truncate text-10 text-muted hover:text-ink hover:underline hover:underline-offset-3 focus-visible:text-ink focus-visible:underline phone:text-9"
        >{{ subtitle }}</RouterLink
      >
      <span v-else class="mt-6 block truncate text-10 text-muted phone:text-9">{{ subtitle }}</span>
    </div>
    <UiIconButton
      icon="heart"
      :label="favoriteLabel"
      :pressed="favorite ?? false"
      :disabled="favoriteDisabled"
      class="ml-6 rail:hidden"
      @click="emit('favorite')"
    />
  </div>
</template>
