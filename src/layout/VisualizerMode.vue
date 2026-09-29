<script setup lang="ts">
/**
 * The visualizer (owner, 2026-09-29): what plays in this browser drawn as the
 * project's ringed disc. The cover turns as a disc whose grooves light with
 * the music, the mark's ring pulses with the bass and the spectrum spreads
 * from it in mirrored spokes, low notes at the bottom and high ones meeting at
 * the top (Visicality's circular designs gave the idea; the code is ours).
 * The sound comes from the browser's own audio element through a Web Audio
 * analyser, so the picture is exactly in time. Space pauses, the right arrow
 * skips; Esc, V, the close button or leaving full screen close it, and so does
 * the end of browser playback. Controls and the pointer hide while the
 * listener only listens; with reduced motion the disc neither turns nor pulses.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import CoverCanvas from '../components/artwork/CoverCanvas.vue'
import { bandLevels, fallingPeaks, groupLevels, logBands, loudest, type Band } from '../domain/spectrum'
import { timeLabel } from '../domain/track'
import { t } from '../i18n'
import { browserAnalyser, browserPlayback, browserTrack, nextInBrowser, toggleBrowser } from '../stores/browser'
import { coverFor } from '../stores/enrichment'
import UiIcon from '../ui/UiIcon.vue'
import { discGeometry, drawDisc } from './discDrawing'
import { closeVisualizer, toggleVisualizerFullscreen } from './visualizer'

const IDLE_MS = 3000
const BANDS = 48
const GROOVES = 7
/** One turn of the disc while playing. */
const TURN_MS = 24_000

// Going elsewhere (the browser's back button, a link) or stopping leaves the visualizer.
const route = useRoute()
watch(
  () => route.fullPath,
  () => closeVisualizer(),
)
watch(browserTrack, (track) => {
  if (!track) closeVisualizer()
})

const root = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const track = browserTrack
const playing = computed(() => browserPlayback.playing)
const hasNext = computed(() => browserPlayback.index + 1 < browserPlayback.queue.length)
const cover = computed(() => (track.value ? coverFor(track.value) : null))

// Made by openVisualizer() inside the click or key press; null where the browser has no Web Audio.
const analyser = browserAnalyser()
/** Set once the analyser has heard something, for the tests and assistive status. */
const live = ref(false)

let image: ImageBitmap | null = null
watch(
  cover,
  async (blob) => {
    const next = blob ? await createImageBitmap(blob).catch(() => null) : null
    image?.close()
    image = next
  },
  { immediate: true },
)

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
let accent = '#f35c3f'
let bins: Uint8Array<ArrayBuffer> | null = null
let bands: Band[] = []
let peaks: number[] = []
let rotation = 0
let last = performance.now()
let frame = 0

function render(now: number): void {
  frame = requestAnimationFrame(render)
  const element = canvas.value
  const context = element?.getContext('2d')
  if (!element || !context) return
  const elapsed = Math.min(100, now - last)
  last = now
  let levels: number[] = new Array<number>(BANDS).fill(0)
  if (analyser) {
    if (!bins || bins.length !== analyser.frequencyBinCount) {
      bins = new Uint8Array(analyser.frequencyBinCount)
      bands = logBands(analyser.frequencyBinCount, analyser.context.sampleRate, BANDS)
    }
    analyser.getByteFrequencyData(bins)
    levels = bandLevels(bins, bands)
  }
  peaks = fallingPeaks(peaks, levels, elapsed)
  if (!live.value && loudest(levels) > 0.05) live.value = true
  if (playing.value && !reduced) rotation = (rotation + (2 * Math.PI * elapsed) / TURN_MS) % (2 * Math.PI)
  const bass = levels.slice(0, 6).reduce((sum, level) => sum + level, 0) / 6
  drawDisc(context, {
    width: element.width,
    height: element.height,
    levels,
    peaks,
    grooves: groupLevels(levels, GROOVES),
    pulse: reduced ? 0 : bass,
    rotation,
    cover: image,
    coverSize: image ? { width: image.width, height: image.height } : null,
    accent,
  })
}

/* The canvas follows its box at the screen's pixel density (at most twice, for a TV's sake). */
let resize: ResizeObserver | null = null
function fit(): void {
  const element = canvas.value
  if (!element) return
  const ratio = Math.min(2, devicePixelRatio || 1)
  element.width = Math.max(1, Math.round(element.clientWidth * ratio))
  element.height = Math.max(1, Math.round(element.clientHeight * ratio))
}
/** The disc's size on screen, for the message placed under it. */
const discBottom = ref('70%')
function place(): void {
  const element = canvas.value
  if (!element) return
  const { cy, ring, reach } = discGeometry(element.clientWidth, element.clientHeight)
  discBottom.value = `${String(Math.round(cy + ring + reach * 0.35))}px`
}

/* Controls and the pointer hide after a few quiet seconds while playing. */
const idle = ref(false)
let idleTimer: ReturnType<typeof setTimeout> | undefined
function wake(): void {
  idle.value = false
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => (idle.value = playing.value), IDLE_MS)
}
watch(playing, wake)

const fullscreen = ref(Boolean(document.fullscreenElement))
function onFullscreen(): void {
  fullscreen.value = Boolean(document.fullscreenElement)
}
/* Keys go to this browser's playback while the visualizer is open, not to the player's. */
function onKey(event: KeyboardEvent): void {
  wake()
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
  if (event.key === 'Escape') {
    event.preventDefault()
    closeVisualizer()
  } else if (event.key === ' ' && !(event.target as HTMLElement | null)?.closest('button')) {
    event.preventDefault()
    toggleBrowser()
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    if (hasNext.value) nextInBrowser()
  } else if (event.key === 'ArrowLeft') event.preventDefault()
}

onMounted(() => {
  root.value?.focus({ preventScroll: true })
  accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || accent
  window.addEventListener('keydown', onKey, { capture: true })
  document.addEventListener('fullscreenchange', onFullscreen)
  if (canvas.value) {
    resize = new ResizeObserver(() => {
      fit()
      place()
    })
    resize.observe(canvas.value)
  }
  fit()
  place()
  last = performance.now()
  frame = requestAnimationFrame(render)
  wake()
})
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  clearTimeout(idleTimer)
  resize?.disconnect()
  image?.close()
  window.removeEventListener('keydown', onKey, { capture: true })
  document.removeEventListener('fullscreenchange', onFullscreen)
})
</script>

<template>
  <div
    ref="root"
    role="dialog"
    aria-modal="true"
    :aria-label="t('visualizer')"
    tabindex="-1"
    class="fixed inset-0 z-90 overflow-hidden bg-[#0e100f] text-white outline-none"
    :class="{ 'cursor-none': idle }"
    data-testid="visualizer"
    :data-live="live ? 'true' : undefined"
    @pointermove="wake"
    @pointerdown="wake"
  >
    <div
      v-if="cover"
      aria-hidden="true"
      class="pointer-events-none absolute -inset-[10%] scale-110 opacity-30 blur-3xl"
    >
      <CoverCanvas :blob="cover" class="size-full" />
    </div>
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 bg-radial from-black/25 via-black/60 to-black/85"
    />
    <canvas ref="canvas" aria-hidden="true" class="absolute inset-0 size-full" data-testid="visualizer-canvas" />

    <header
      class="absolute inset-x-0 top-0 flex items-center gap-16 px-[4vw] pt-22 transition-opacity duration-500"
      :class="idle ? 'opacity-0' : 'opacity-100'"
    >
      <div class="min-w-0 flex-1">
        <p class="text-16 m-0 truncate font-semibold">{{ track?.title ?? t('visualizer') }}</p>
        <p v-if="track?.artist" class="m-0 mt-2 truncate text-12 text-white/65">{{ track.artist }}</p>
      </div>
      <button
        type="button"
        class="grid size-40 place-items-center rounded-full text-white/80 hover:bg-white/12 hover:text-white"
        :aria-label="fullscreen ? t('fullscreen_exit') : t('fullscreen_enter')"
        :title="fullscreen ? t('fullscreen_exit') : t('fullscreen_enter')"
        @click="toggleVisualizerFullscreen"
      >
        <UiIcon :name="fullscreen ? 'fullscreen-exit' : 'fullscreen'" class="size-20" />
      </button>
      <button
        type="button"
        class="grid size-40 place-items-center rounded-full text-white/80 hover:bg-white/12 hover:text-white"
        :aria-label="t('visualizer_close')"
        :title="t('visualizer_close')"
        @click="closeVisualizer"
      >
        <UiIcon name="close" class="size-20" />
      </button>
    </header>

    <p
      v-if="!analyser"
      role="status"
      class="absolute inset-x-0 m-0 px-[6vw] text-center text-14 text-white/70"
      :style="{ top: discBottom }"
    >
      {{ t('visualizer_unavailable') }}
    </p>

    <footer
      class="absolute inset-x-0 bottom-0 flex items-center justify-center gap-22 pt-10 pb-26 transition-opacity duration-500"
      :class="idle ? 'opacity-0' : 'opacity-100'"
    >
      <span class="w-56 text-right text-12 text-white/60 tabular-nums">{{ timeLabel(browserPlayback.position) }}</span>
      <!-- Browser playback has no previous track: a spacer keeps Play in the middle. -->
      <span aria-hidden="true" class="size-44" />
      <button
        type="button"
        class="grid size-58 place-items-center rounded-full bg-white text-[#0e100f] hover:bg-white/90"
        :aria-label="t(playing ? 'pause' : 'play')"
        data-testid="visualizer-toggle"
        @click="toggleBrowser"
      >
        <UiIcon :name="playing ? 'pause' : 'play'" class="size-24" />
      </button>
      <button
        type="button"
        class="grid size-44 place-items-center rounded-full text-white/85 hover:enabled:bg-white/12 disabled:opacity-40"
        :aria-label="t('next_track')"
        :disabled="!hasNext"
        @click="nextInBrowser"
      >
        <UiIcon name="next" class="size-22" />
      </button>
      <span class="w-56 text-12 text-white/60 tabular-nums">{{ timeLabel(browserPlayback.lengthMs) }}</span>
    </footer>
  </div>
</template>
