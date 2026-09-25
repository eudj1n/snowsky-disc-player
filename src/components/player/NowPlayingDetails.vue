<script setup lang="ts">
/**
 * Now Playing section of the listening panel (reference .listening-main):
 * large sleeve, status with format badge, title, artist and album links,
 * timeline, transport and volume. Mirrors the mini-player's disabled rules.
 */
import type { Playback, PlaybackState, TransportAction } from '../../domain/playback'
import { formatBadge, timeLabel } from '../../domain/track'
import UiIcon from '../../ui/UiIcon.vue'
import UiIconButton from '../../ui/UiIconButton.vue'
import Artwork from '../artwork/Artwork.vue'

defineProps<{
  playback: Playback
  cover: Blob | null
  status: string
  controlsDisabled: boolean
  volume: number | null
  labels: {
    title: string
    shuffle: string
    previous: string
    play: string
    pause: string
    next: string
    repeat: string
    favorite: string
    seek: string
    volume: string
    output: string
    format: string
  }
}>()
const emit = defineEmits<{ transport: [action: TransportAction]; navigate: [] }>()
const playing = (state: PlaybackState) => state === 'playing'
</script>

<template>
  <div>
    <div
      class="mx-auto mb-24 aspect-square w-[min(100%,28dvh)] overflow-hidden rounded-14 shadow-[0_12px_28px_#07100820] phone:mb-22 phone:w-[min(100%,30dvh)]"
    >
      <Artwork :title="playback.track?.title ?? null" :cover="cover" />
    </div>
    <p class="flex items-center justify-between gap-10 text-11 text-muted">
      <span>{{ status }}</span>
      <span
        v-if="formatBadge(playback.track?.path ?? null)"
        :title="labels.format"
        class="rounded-5 border border-line px-7 py-4 text-10 tracking-[1px]"
        >{{ formatBadge(playback.track?.path ?? null) }}</span
      >
    </p>
    <h2 class="mt-14 mb-8 text-28 leading-[1.15] font-bold tracking-[-0.8px] [overflow-wrap:anywhere] phone:text-25">
      {{ playback.track?.title ?? labels.title }}
    </h2>
    <RouterLink
      v-if="playback.track?.artist"
      :to="{ name: 'artist', params: { name: playback.track.artist } }"
      class="block text-15 leading-[1.5] [overflow-wrap:anywhere] text-secondary hover:underline"
      @click="emit('navigate')"
      >{{ playback.track.artist }}</RouterLink
    >
    <RouterLink
      v-if="playback.track?.album"
      :to="{ name: 'album', params: { name: playback.track.album } }"
      class="mt-4 mb-24 block text-12 [overflow-wrap:anywhere] text-muted hover:underline"
      @click="emit('navigate')"
      >{{ playback.track.album }}</RouterLink
    >
    <div class="flex items-center gap-10 text-9 text-muted tabular-nums">
      <span class="whitespace-nowrap">—:—</span>
      <input class="seek-slider" type="range" min="0" max="100" value="0" disabled :aria-label="labels.seek" />
      <span class="whitespace-nowrap">{{ timeLabel(playback.track?.durationMs ?? null) }}</span>
    </div>
    <div class="my-20 flex items-center justify-center gap-32">
      <UiIconButton
        icon="previous"
        :label="labels.previous"
        :disabled="controlsDisabled"
        class="text-ink"
        @click="emit('transport', 'previous')"
      />
      <button
        type="button"
        :aria-label="playing(playback.state) ? labels.pause : labels.play"
        :disabled="controlsDisabled"
        class="flex size-54 items-center justify-center rounded-full bg-[#30362b] text-white hover:enabled:scale-[1.05] dark:bg-[#d8e1cc] dark:text-[#1b2316]"
        @click="emit('transport', 'toggle')"
      >
        <UiIcon :name="playing(playback.state) ? 'pause' : 'play'" class="size-21 fill-current stroke-[1.5]" />
      </button>
      <UiIconButton
        icon="next"
        :label="labels.next"
        :disabled="controlsDisabled"
        class="text-ink"
        @click="emit('transport', 'next')"
      />
    </div>
    <div class="mt-10 mb-15 flex justify-center gap-45">
      <UiIconButton icon="shuffle" :label="labels.shuffle" :pressed="false" disabled />
      <UiIconButton icon="heart" :label="labels.favorite" :pressed="playback.favorite ?? false" disabled />
      <UiIconButton icon="repeat" :label="labels.repeat" :pressed="false" disabled />
    </div>
    <div class="flex items-center gap-13 text-muted">
      <UiIcon name="volume" class="size-16" />
      <input
        type="range"
        min="0"
        max="120"
        :value="volume ?? 0"
        disabled
        :aria-label="labels.volume"
        class="h-3 flex-1 accent-progress-fill"
      />
      <output class="min-w-19 text-10">{{ volume ?? '—' }}</output>
    </div>
    <p class="mt-20 text-10 text-muted">{{ labels.output }}</p>
  </div>
</template>
