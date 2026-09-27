<script setup lang="ts">
/**
 * Karaoke (owner, round 16): the current track's lyrics full screen in a large
 * font, at most seven lines (two sung, the current one, four to come). The
 * current line fills as it is sung: word by word (or syllable by syllable)
 * where the LRC has word timings, otherwise across the line until the next
 * one. Plain lyrics read large without a highlight. Space and the arrows keep
 * their shortcuts; Esc, the close button or leaving full screen close it.
 * Controls and the pointer hide while the listener only listens.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CoverCanvas from '../components/artwork/CoverCanvas.vue'
import {
  activeLine,
  karaokeRange,
  lineProgress,
  livePosition,
  wordProgress,
  type LyricLine,
  type Lyrics,
} from '../domain/lyrics'
import { timeLabel } from '../domain/track'
import { t } from '../i18n'
import { coverFor } from '../stores/enrichment'
import { lyrics } from '../stores/lyrics'
import { observations } from '../stores/observations'
import { isPlaying, playback } from '../stores/playback'
import UiIcon from '../ui/UiIcon.vue'
import { closeKaraoke, toggleKaraokeFullscreen } from './karaoke'
import { usePlayerControls } from './usePlayerControls'

const IDLE_MS = 3000

const player = usePlayerControls()
const root = ref<HTMLElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const column = ref<HTMLElement | null>(null)

const track = computed(() => playback.current.track)
const cover = computed(() => (track.value ? coverFor(track.value) : null))
const lines = computed<readonly LyricLine[]>(() => (lyrics.lyrics?.lines ?? []) as readonly LyricLine[])
const synced = computed(() => Boolean(lyrics.lyrics?.synced))

/* A frame clock while synced lyrics play, so the sweep moves smoothly between position ticks. */
const now = ref(performance.now())
let frame = 0
function tick(): void {
  now.value = performance.now()
  frame = requestAnimationFrame(tick)
}
watch(
  () => isPlaying.value && synced.value,
  (running) => {
    cancelAnimationFrame(frame)
    now.value = performance.now()
    if (running) frame = requestAnimationFrame(tick)
  },
  { immediate: true },
)
const position = computed(() =>
  livePosition(observations.positionMs, observations.positionAt, now.value, isPlaying.value),
)
const active = computed(() => (lyrics.lyrics ? activeLine(lyrics.lyrics as Lyrics, position.value) : -1))
const range = computed(() => karaokeRange(lines.value.length, active.value))
const nextMs = computed(() => {
  for (let index = active.value + 1; index < lines.value.length; index++) {
    const ms = lines.value[index]?.timeMs
    if (ms !== null && ms !== undefined) return ms
  }
  return null
})
/** The current line as parts with how much of each is sung (words, or the whole line). */
const sung = computed(() => {
  const line = lines.value[active.value]
  if (!line) return []
  if (line.words?.length) {
    const progress = wordProgress(line, nextMs.value, position.value)
    return line.words.map((word, index) => ({ text: word.text, progress: progress[index] ?? 0 }))
  }
  return [{ text: line.text || '♪', progress: lineProgress(line, nextMs.value, position.value) }]
})
const fill = (progress: number) => {
  const at = `${(progress * 100).toFixed(2)}%`
  return { backgroundImage: `linear-gradient(90deg, var(--accent) ${at}, rgb(255 255 255 / 0.96) ${at})` }
}

/** Past lines fade, the coming ones stay readable; lines outside the window are hidden. */
function lineClass(index: number): string {
  const { from, to, center } = range.value
  if (!synced.value) return 'opacity-95'
  if (index < from || index > to) return 'opacity-0'
  if (index === active.value) return 'opacity-100'
  if (index < center) return 'opacity-35'
  return index - center <= 1 ? 'opacity-75' : 'opacity-50'
}

/* The current line sits a little above the middle; the column slides to it. */
const offset = ref(0)
async function center(): Promise<void> {
  await nextTick()
  const box = stage.value
  const line = column.value?.querySelector<HTMLElement>(`[data-line="${String(range.value.center)}"]`)
  if (!box || !line || !synced.value) {
    offset.value = 0
    return
  }
  offset.value = Math.round(box.clientHeight * 0.42 - (line.offsetTop + line.offsetHeight / 2))
}
watch([() => range.value.center, lines], () => void center())
let resize: ResizeObserver | null = null

/* Controls and the pointer hide after a few quiet seconds while playing. */
const idle = ref(false)
let idleTimer: ReturnType<typeof setTimeout> | undefined
function wake(): void {
  idle.value = false
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => (idle.value = isPlaying.value), IDLE_MS)
}
watch(isPlaying, wake)

const fullscreen = ref(Boolean(document.fullscreenElement))
function onFullscreen(): void {
  fullscreen.value = Boolean(document.fullscreenElement)
  void center()
}
function onKey(event: KeyboardEvent): void {
  wake()
  if (event.key === 'Escape' && !event.defaultPrevented) {
    event.preventDefault()
    closeKaraoke()
  }
}

const message = computed(() => {
  if (!track.value) return t('lyrics_idle')
  if (lyrics.status === 'loading') return t('lyrics_loading')
  if (lyrics.status === 'unavailable') return t('lyrics_unavailable')
  return t('lyrics_none')
})
const toggleLabel = computed(() => (isPlaying.value ? t('pause') : t('play')))

onMounted(() => {
  root.value?.focus({ preventScroll: true })
  document.addEventListener('keydown', onKey)
  document.addEventListener('fullscreenchange', onFullscreen)
  if (stage.value) {
    resize = new ResizeObserver(() => void center())
    resize.observe(stage.value)
  }
  void document.fonts.ready.then(() => center())
  wake()
})
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  clearTimeout(idleTimer)
  resize?.disconnect()
  document.removeEventListener('keydown', onKey)
  document.removeEventListener('fullscreenchange', onFullscreen)
})
</script>

<template>
  <div
    ref="root"
    role="dialog"
    aria-modal="true"
    :aria-label="t('karaoke')"
    tabindex="-1"
    class="fixed inset-0 z-90 flex flex-col overflow-hidden bg-[#0e100f] text-white outline-none"
    :class="{ 'cursor-none': idle }"
    data-testid="karaoke"
    @pointermove="wake"
    @pointerdown="wake"
  >
    <div
      v-if="cover"
      aria-hidden="true"
      class="pointer-events-none absolute -inset-[10%] scale-110 opacity-40 blur-3xl"
    >
      <CoverCanvas :blob="cover" class="size-full" />
    </div>
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 bg-linear-to-b from-black/65 via-black/35 to-black/75"
    />

    <header
      class="relative flex items-center gap-16 px-[4vw] pt-22 transition-opacity duration-500"
      :class="idle ? 'opacity-0' : 'opacity-100'"
    >
      <div class="min-w-0 flex-1">
        <p class="text-16 m-0 truncate font-semibold">{{ track?.title ?? t('karaoke') }}</p>
        <p v-if="track?.artist" class="m-0 mt-2 truncate text-12 text-white/65">{{ track.artist }}</p>
      </div>
      <button
        type="button"
        class="grid size-40 place-items-center rounded-full text-white/80 hover:bg-white/12 hover:text-white"
        :aria-label="fullscreen ? t('fullscreen_exit') : t('fullscreen_enter')"
        :title="fullscreen ? t('fullscreen_exit') : t('fullscreen_enter')"
        @click="toggleKaraokeFullscreen"
      >
        <UiIcon :name="fullscreen ? 'fullscreen-exit' : 'fullscreen'" class="size-20" />
      </button>
      <button
        type="button"
        class="grid size-40 place-items-center rounded-full text-white/80 hover:bg-white/12 hover:text-white"
        :aria-label="t('karaoke_close')"
        :title="t('karaoke_close')"
        @click="closeKaraoke"
      >
        <UiIcon name="close" class="size-20" />
      </button>
    </header>

    <div ref="stage" class="relative min-h-0 flex-1 overflow-hidden" :class="{ 'overflow-y-auto': !synced }">
      <p
        v-if="!lines.length"
        class="text-20 absolute inset-x-0 top-[40%] m-0 px-[6vw] text-center text-white/70"
        role="status"
      >
        {{ message }}
      </p>
      <div
        v-else
        ref="column"
        class="px-[6vw] text-center font-bold tracking-[-0.02em] text-balance motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out"
        :class="synced ? 'absolute inset-x-0 top-0' : 'py-[8vh]'"
        :style="{ transform: `translateY(${offset}px)`, fontSize: 'clamp(24px, min(7.2vh, 7vw), 96px)' }"
        data-testid="karaoke-lines"
      >
        <p
          v-for="(line, index) in lines"
          :key="index"
          :data-line="index"
          :aria-current="index === active ? 'true' : undefined"
          :aria-hidden="synced && (index < range.from || index > range.to) ? 'true' : undefined"
          class="m-0 py-[0.16em] leading-[1.18] motion-safe:transition-opacity motion-safe:duration-500"
          :class="lineClass(index)"
        >
          <template v-if="synced && index === active">
            <span
              v-for="(part, at) in sung"
              :key="at"
              class="bg-clip-text text-transparent"
              :data-progress="part.progress.toFixed(2)"
              :style="fill(part.progress)"
              >{{ part.text }}</span
            >
          </template>
          <template v-else>{{ line.text || (synced ? '♪' : ' ') }}</template>
        </p>
      </div>
    </div>

    <footer
      class="relative flex items-center justify-center gap-22 pt-10 pb-26 transition-opacity duration-500"
      :class="idle ? 'opacity-0' : 'opacity-100'"
    >
      <span class="w-56 text-right text-12 text-white/60 tabular-nums">{{ timeLabel(position) }}</span>
      <button
        type="button"
        class="grid size-44 place-items-center rounded-full text-white/85 hover:enabled:bg-white/12 disabled:opacity-40"
        :aria-label="t('previous_track')"
        :disabled="player.controlsDisabled.value"
        @click="player.onTransport('previous')"
      >
        <UiIcon name="previous" class="size-22" />
      </button>
      <button
        type="button"
        class="grid size-58 place-items-center rounded-full bg-white text-[#0e100f] hover:enabled:bg-white/90 disabled:opacity-40"
        :aria-label="toggleLabel"
        :disabled="player.controlsDisabled.value"
        data-testid="karaoke-toggle"
        @click="player.onTransport('toggle')"
      >
        <UiIcon :name="isPlaying ? 'pause' : 'play'" class="size-24" />
      </button>
      <button
        type="button"
        class="grid size-44 place-items-center rounded-full text-white/85 hover:enabled:bg-white/12 disabled:opacity-40"
        :aria-label="t('next_track')"
        :disabled="player.controlsDisabled.value"
        @click="player.onTransport('next')"
      >
        <UiIcon name="next" class="size-22" />
      </button>
      <span class="w-56 text-12 text-white/60 tabular-nums">{{ timeLabel(track?.durationMs ?? null) }}</span>
    </footer>
  </div>
</template>
