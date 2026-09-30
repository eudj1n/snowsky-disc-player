<script setup lang="ts">
/**
 * The head of the Now tab (reference .listening-main): large cover, status
 * with format badge, title, artist and album links and where playback comes
 * from. On phones, where the open panel is a full-screen player, the timeline
 * with seek feedback, transport, modes, favorite and volume follow; on wider
 * screens the bottom bar is the one control surface (owner, 2026-09-29). The
 * default slot takes what the tab shows below (the facts, the queue).
 */
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import type { Playback, TransportAction } from '../../domain/playback'
import { formatRate, resampled, type OutputFacts } from '../../domain/device'
import { isHiRes, qualityLabel, type AudioQuality } from '../../domain/quality'
import { formatBadge } from '../../domain/track'
import UiIcon from '../../ui/UiIcon.vue'
import UiHiResBadge from '../../ui/UiHiResBadge.vue'
import UiIconButton from '../../ui/UiIconButton.vue'
import Artwork from '../artwork/Artwork.vue'
import ArtistCredit from '../track/ArtistCredit.vue'
import SeekBar from './SeekBar.vue'
import VolumeControl from './VolumeControl.vue'

const props = defineProps<{
  playback: Playback
  cover: Blob | null
  status: string
  positionMs: number | null
  identity: string | null
  seekFeedback: string | null
  controlsDisabled: boolean
  modesDisabled: boolean
  seekDisabled: boolean
  favoriteDisabled: boolean
  shuffle: boolean
  repeat: boolean
  volume: number | null
  volumeDisabled: boolean
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
    volumeTitle: string
    mute: string
    unmute: string
    output: string
    format: string
    /** "{rate}" stands for the output rate. */
    resampled: string
    playingFrom: string
    /** The button that shows an observed cover in full size. */
    coverFullSize: string
  }
  /** Where playback comes from, when known. */
  context?: { text: string; to: RouteLocationRaw | null } | null
  /** The stream the DAC gets (next image); shown when its rate differs from the file's. */
  output?: OutputFacts | null
}>()
const outputRate = computed(() =>
  props.output && resampled(props.output, props.playback.track?.sampleRate) && props.output.rate
    ? formatRate(props.output.rate)
    : null,
)
/** The playing file's format and what stock reports about its decoding. */
const quality = computed<AudioQuality>(() => ({
  format: formatBadge(props.playback.track?.path ?? null),
  sampleRate: props.playback.track?.sampleRate ?? null,
  bitDepth: props.playback.track?.bitDepth ?? null,
  bitRate: props.playback.track?.bitRate ?? null,
  dsd: props.playback.track?.dsd ?? false,
}))
const emit = defineEmits<{
  transport: [action: TransportAction]
  mode: [kind: 'shuffle' | 'repeat']
  seek: [seconds: number, identity: string]
  favorite: []
  volume: [value: number]
  mute: []
  navigate: []
  /** Show the observed cover in full size. */
  cover: []
}>()
</script>

<template>
  <div>
    <div
      class="mx-auto mb-24 aspect-square w-full overflow-hidden rounded-14 shadow-[0_12px_28px_#07100820] phone:mb-22 phone:w-[min(100%,30dvh)]"
    >
      <Transition
        mode="out-in"
        enter-from-class="opacity-0 scale-[0.96]"
        enter-active-class="transition-[opacity,scale] duration-300 ease-out motion-reduce:transition-none"
        leave-active-class="transition-opacity duration-150 ease-in motion-reduce:transition-none"
        leave-to-class="opacity-0"
      >
        <!-- An observed cover opens in full size (owner, 2026-09-30); the typographic sleeve does not. -->
        <button
          v-if="cover"
          :key="identity ?? 'none'"
          type="button"
          class="group block size-full cursor-zoom-in p-0"
          :aria-label="labels.coverFullSize"
          data-testid="now-cover-open"
          @click="emit('cover')"
        >
          <Artwork :title="playback.track?.title ?? null" :cover="cover" />
        </button>
        <Artwork v-else :key="identity ?? 'none'" :title="playback.track?.title ?? null" :cover="cover" />
      </Transition>
    </div>
    <p class="flex items-center justify-between gap-10 text-11 text-muted">
      <span>{{ status }}</span>
      <span v-if="quality.format" class="flex items-center gap-6" data-testid="quality">
        <UiHiResBadge v-if="isHiRes(quality)" class="py-5" />
        <span :title="labels.format" class="rounded-5 border border-line px-7 py-4 text-11 tracking-[1px]"
          >{{ quality.format }}<template v-if="qualityLabel(quality)"> · {{ qualityLabel(quality) }}</template
          ><span v-if="outputRate" data-testid="output-rate" :title="labels.resampled.replace('{rate}', outputRate)">
            → {{ outputRate }}</span
          ></span
        >
      </span>
    </p>
    <h2 class="mt-14 mb-8 text-28 leading-[1.15] font-bold tracking-[-0.8px] [overflow-wrap:anywhere] phone:text-25">
      {{ playback.track?.title ?? labels.title }}
    </h2>
    <!-- Each artist of a joint credit ("A; B") links on its own. -->
    <p
      v-if="playback.track?.artist"
      class="m-0 text-15 leading-[1.5] [overflow-wrap:anywhere] text-secondary"
      @click="($event.target as HTMLElement).closest('a') && emit('navigate')"
    >
      <ArtistCredit
        :credit="playback.track.artist"
        :to="(name) => ({ name: 'artist', params: { name } })"
        link-class="hover:underline"
      />
    </p>
    <RouterLink
      v-if="playback.track?.album"
      :to="
        playback.track.artist
          ? { name: 'album', params: { name: playback.track.album, artist: playback.track.artist } }
          : { name: 'album', params: { name: playback.track.album } }
      "
      class="mt-4 mb-24 block text-12 [overflow-wrap:anywhere] text-muted hover:underline"
      @click="emit('navigate')"
      >{{ playback.track.album }}</RouterLink
    >
    <p v-if="context" class="-mt-14 mb-22 flex min-w-0 items-center gap-6 text-11 text-muted">
      <UiIcon name="queue" class="size-12 shrink-0" />
      <span class="shrink-0">{{ labels.playingFrom }} ·</span>
      <RouterLink
        v-if="context.to"
        :to="context.to"
        class="truncate text-secondary hover:text-ink hover:underline hover:underline-offset-3"
        @click="emit('navigate')"
        >{{ context.text }}</RouterLink
      >
      <span v-else class="truncate">{{ context.text }}</span>
    </p>
    <div class="hidden phone:block" data-testid="panel-controls">
      <SeekBar
        class="text-10"
        :position-ms="positionMs"
        :duration-ms="playback.track?.durationMs ?? null"
        :identity="identity"
        :disabled="seekDisabled"
        :label="labels.seek"
        @seek="(seconds, id) => emit('seek', seconds, id)"
      />
      <p v-if="seekFeedback" role="status" class="mt-6 text-11 text-secondary">{{ seekFeedback }}</p>
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
          :aria-label="playback.state === 'playing' ? labels.pause : labels.play"
          :disabled="controlsDisabled"
          class="flex size-54 items-center justify-center rounded-full bg-strong text-strong-ink hover:enabled:scale-[1.05]"
          @click="emit('transport', 'toggle')"
        >
          <UiIcon filled :name="playback.state === 'playing' ? 'pause' : 'play'" class="size-21 stroke-[1.5]" />
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
        <UiIconButton
          icon="shuffle"
          :label="labels.shuffle"
          :pressed="shuffle"
          :disabled="modesDisabled"
          @click="emit('mode', 'shuffle')"
        />
        <UiIconButton
          icon="heart"
          :label="labels.favorite"
          :pressed="playback.favorite ?? false"
          :disabled="favoriteDisabled"
          class="not-aria-pressed:text-muted [&>svg]:size-17"
          @click="emit('favorite')"
        />
        <UiIconButton
          icon="repeat"
          :label="labels.repeat"
          :pressed="repeat"
          :disabled="modesDisabled"
          @click="emit('mode', 'repeat')"
        />
      </div>
      <VolumeControl
        class="text-muted"
        :volume="volume"
        :disabled="volumeDisabled"
        :label="labels.volume"
        :title="labels.volumeTitle"
        :mute-label="labels.mute"
        :unmute-label="labels.unmute"
        @change="(value) => emit('volume', value)"
        @mute="emit('mute')"
      />
      <p class="mt-20 text-11 text-muted">{{ labels.output }}</p>
    </div>
    <slot />
  </div>
</template>
