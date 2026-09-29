<script setup lang="ts">
/**
 * What plays in this browser (combined-008), independent of the player: a
 * small bar above the player's, with play/pause, next, the visualizer
 * (2026-09-29) and stop. The player itself is not touched.
 */
import { computed } from 'vue'
import { t } from '../i18n'
import { browserPlayback, browserTrack, nextInBrowser, stopInBrowser, toggleBrowser } from '../stores/browser'
import UiIcon from '../ui/UiIcon.vue'
import UiIconButton from '../ui/UiIconButton.vue'
import { openVisualizer } from './visualizer'
import { timeLabel } from '../domain/track'

const track = browserTrack
const hasNext = computed(() => browserPlayback.index + 1 < browserPlayback.queue.length)
</script>

<template>
  <section
    v-if="track"
    :aria-label="t('browser_playing')"
    data-testid="browser-player"
    class="fixed right-16 bottom-[calc(var(--player)+12px)] z-40 flex max-w-[min(420px,calc(100%-32px))] items-center gap-10 rounded-18 border border-line bg-paper py-8 pr-8 pl-14 text-ink shadow-[0_12px_40px_#0003] phone:bottom-[calc(var(--player)+70px)]"
  >
    <UiIcon name="headphones" class="size-18! shrink-0 text-accent" />
    <span class="min-w-0 flex-1">
      <small class="block text-10 tracking-[1px] text-muted uppercase">{{ t('browser_playing') }}</small>
      <strong class="block truncate text-13 font-semibold">{{ track.title }}</strong>
      <small class="block truncate text-11 text-muted"
        >{{ track.artist ?? '—' }} · {{ timeLabel(browserPlayback.position) }}</small
      >
    </span>
    <UiIconButton
      :icon="browserPlayback.playing ? 'pause' : 'play'"
      :label="t(browserPlayback.playing ? 'pause' : 'play')"
      data-testid="browser-toggle"
      @click="toggleBrowser"
    />
    <UiIconButton icon="next" :label="t('next_track')" :disabled="!hasNext" @click="nextInBrowser" />
    <UiIconButton
      icon="visualizer"
      :label="t('visualizer_open')"
      data-testid="visualizer-open"
      @click="openVisualizer"
    />
    <UiIconButton icon="stop" :label="t('browser_stop')" data-testid="browser-stop" @click="stopInBrowser" />
  </section>
</template>
