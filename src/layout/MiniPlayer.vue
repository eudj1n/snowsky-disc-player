<script setup lang="ts">
/**
 * What the mini player's window shows (owner, 2026-10-21; layout/miniPlayer.ts
 * opens it): the Now Playing head on the cover's colours — the cover, the
 * status with the format badge, the title, artist and album — and below, as
 * on the phone's full-screen player, the timeline, transport, favorite and
 * repeat. The same controls as the bar, on whichever side plays.
 */
import { computed } from 'vue'
import Artwork from '../components/artwork/Artwork.vue'
import SeekBar from '../components/player/SeekBar.vue'
import { creditLabel } from '../domain/artist'
import { isHiRes, qualityLabel, type AudioQuality } from '../domain/quality'
import { formatBadge } from '../domain/track'
import { t } from '../i18n'
import { connection } from '../stores/connection'
import { coverFor } from '../stores/enrichment'
import { nowColourStyle } from '../stores/nowColours'
import { inBrowser, nowPlaying, nowPositionMs } from '../stores/output'
import UiHiResBadge from '../ui/UiHiResBadge.vue'
import UiIcon from '../ui/UiIcon.vue'
import UiIconButton from '../ui/UiIconButton.vue'
import { miniPlayerBody } from './miniPlayer'
import { usePlayerControls } from './usePlayerControls'

const player = usePlayerControls()
const track = computed(() => nowPlaying.value.track)
const cover = computed(() => (track.value ? coverFor(track.value) : null))
const status = computed(() =>
  inBrowser.value || connection.connection === 'connected'
    ? t(`playback_${nowPlaying.value.state}`)
    : t('disconnected'),
)
const quality = computed<AudioQuality>(() => ({
  format: formatBadge(track.value?.path ?? null),
  sampleRate: track.value?.sampleRate ?? null,
  bitDepth: track.value?.bitDepth ?? null,
  bitRate: track.value?.bitRate ?? null,
  dsd: track.value?.dsd ?? false,
}))
</script>

<template>
  <Teleport v-if="miniPlayerBody" :to="miniPlayerBody">
    <section
      :aria-label="t('mini_player')"
      class="flex min-h-dvh flex-col px-20 pt-18 pb-18 text-ink"
      :class="nowColourStyle ? 'on-cover' : 'bg-raised'"
      :style="nowColourStyle ?? undefined"
      data-testid="mini-player"
    >
      <div
        class="mx-auto mb-16 aspect-square w-[min(100%,46dvh)] overflow-hidden rounded-14 shadow-[0_12px_28px_#07100820]"
      >
        <Artwork :title="track?.title ?? null" :cover="cover" />
      </div>
      <p class="m-0 flex items-center justify-between gap-10 text-footnote text-muted">
        <span>{{ status }}</span>
        <span v-if="quality.format" class="flex items-center gap-6" data-testid="mini-quality">
          <UiHiResBadge v-if="isHiRes(quality)" class="py-5" />
          <span
            :title="t('format_from_filename')"
            class="rounded-5 border border-line px-7 py-4 text-caption2 tracking-caps"
            >{{ quality.format }}<template v-if="qualityLabel(quality)"> · {{ qualityLabel(quality) }}</template></span
          >
        </span>
      </p>
      <h2 class="mt-10 mb-4 truncate text-title2 font-bold tracking-title" data-testid="mini-title">
        {{ track?.title ?? t('your_music_awaits') }}
      </h2>
      <p v-if="track?.artist" class="m-0 truncate text-callout leading-[1.5] text-secondary">
        {{ creditLabel(track.artist) }}
      </p>
      <p v-if="track?.album" class="mt-2 mb-0 truncate text-footnote text-muted">{{ track.album }}</p>
      <div class="mt-auto pt-16">
        <SeekBar
          class="text-caption"
          :position-ms="nowPositionMs"
          :duration-ms="track?.durationMs ?? null"
          :identity="player.identity.value"
          :disabled="player.seekDisabled.value"
          :label="t('seek_position')"
          @seek="player.onSeek"
        />
        <div class="my-14 flex items-center justify-center gap-28">
          <UiIconButton
            icon="previous"
            :label="t('previous_track')"
            :disabled="player.controlsDisabled.value"
            class="text-ink"
            @click="player.onTransport('previous')"
          />
          <button
            type="button"
            :aria-label="nowPlaying.state === 'playing' ? t('pause') : t('play')"
            :disabled="player.controlsDisabled.value"
            class="flex size-54 items-center justify-center rounded-full bg-strong text-strong-ink hover:enabled:scale-[1.05]"
            data-testid="mini-toggle"
            @click="player.onTransport('toggle')"
          >
            <UiIcon filled :name="nowPlaying.state === 'playing' ? 'pause' : 'play'" class="size-21 stroke-[1.5]" />
          </button>
          <UiIconButton
            icon="next"
            :label="t('next_track')"
            :disabled="player.controlsDisabled.value"
            class="text-ink"
            @click="player.onTransport('next')"
          />
        </div>
        <div class="flex justify-center gap-40">
          <UiIconButton
            icon="heart"
            :label="t('favorite_track')"
            :pressed="nowPlaying.favorite ?? false"
            :disabled="player.favoriteDisabled.value"
            class="not-aria-pressed:text-muted [&>svg]:size-17"
            @click="player.onFavorite"
          />
          <UiIconButton
            :icon="player.repeatOne.value ? 'repeat-one' : 'repeat'"
            :label="t(player.repeatOne.value ? 'repeat_one' : 'repeat_queue')"
            :pressed="player.repeat.value"
            :disabled="player.modesDisabled.value"
            @click="player.onMode('repeat')"
          />
        </div>
      </div>
    </section>
  </Teleport>
</template>
