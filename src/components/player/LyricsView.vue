<script setup lang="ts">
/**
 * Lyrics of the current track. Synced lyrics highlight the line being sung
 * and keep it in view (unless the listener scrolled in the last few seconds);
 * a line can be clicked to seek there. A pause (an empty line, or a note or
 * dots in the LRC) shows three dots, as karaoke does (owner, 2026-09-29): the
 * current pause fills them in turn until the next line. Plain lyrics read as
 * text. Lines are bold, as in karaoke, and their text lines up with the
 * heading: the hover background reaches into the gutter (owner, 2026-09-30).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type DeepReadonly } from 'vue'
import { activeLine, livePosition, pauseDots, silentLine, type Lyrics } from '../../domain/lyrics'

const props = defineProps<{
  lyrics: DeepReadonly<Lyrics> | null
  positionMs: number | null
  /** When positionMs arrived (performance.now()); with `playing`, lines follow between ticks. */
  positionAt?: number | null
  playing?: boolean
  message: string | null
  source: string | null
  seekLabel: string
  seekable: boolean
}>()
const emit = defineEmits<{ seek: [ms: number] }>()
const box = ref<HTMLElement | null>(null)
/* A 100 ms clock while synced lyrics play, so lines change on their stamps, not on the next tick. */
const now = ref(performance.now())
let clock: ReturnType<typeof setInterval> | undefined
watch(
  () => Boolean(props.playing && props.lyrics?.synced),
  (running) => {
    clearInterval(clock)
    clock = running ? setInterval(() => (now.value = performance.now()), 100) : undefined
  },
  { immediate: true },
)
onBeforeUnmount(() => clearInterval(clock))
const position = computed(() => livePosition(props.positionMs, props.positionAt ?? null, now.value, props.playing))
const active = computed(() => (props.lyrics ? activeLine(props.lyrics as Lyrics, position.value) : -1))
const pause = computed(() =>
  props.lyrics ? pauseDots((props.lyrics as Lyrics).lines, active.value, position.value) : null,
)
/** A dot of a pause, from the line's colour towards the accent as it fills. */
const dot = (progress: number) => ({
  backgroundColor: `color-mix(in srgb, var(--accent) ${String(Math.round(progress * 100))}%, currentColor)`,
  transform: `scale(${String(0.72 + 0.28 * progress)})`,
})
let touchedAt = 0
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

async function reveal(index: number, smooth: boolean): Promise<void> {
  if (index < 0) return
  await nextTick()
  box.value
    ?.querySelector<HTMLElement>(`[data-line="${String(index)}"]`)
    ?.scrollIntoView({ block: 'center', behavior: smooth && !reduced() ? 'smooth' : 'auto' })
}
// Following playback: smoothly, unless the listener scrolled in the last few seconds.
watch(active, (index) => {
  if (Date.now() - touchedAt >= 4000) void reveal(index, true)
})
// Opening the tab (also paused) or new lyrics: straight to the current line.
onMounted(() => void reveal(active.value, false))
watch(
  () => props.lyrics,
  () => void reveal(active.value, false),
)
</script>

<template>
  <div
    ref="box"
    class="min-h-0 flex-1 [scrollbar-width:thin] overflow-auto overscroll-contain px-24 pb-28"
    data-testid="lyrics"
    @wheel.passive="touchedAt = Date.now()"
    @touchmove.passive="touchedAt = Date.now()"
  >
    <p v-if="!lyrics" class="mt-24 text-footnote leading-[1.55] text-muted" role="status">{{ message }}</p>
    <template v-else-if="lyrics.synced">
      <button
        v-for="(line, index) in lyrics.lines"
        :key="index"
        type="button"
        :data-line="index"
        :aria-current="index === active ? 'true' : undefined"
        :aria-label="silentLine(line) ? seekLabel : undefined"
        :disabled="!seekable || line.timeMs === null"
        class="-mx-6 block w-[calc(100%+12px)] rounded-8 px-6 py-5 text-left text-title3 leading-[1.45] font-bold tracking-heading text-muted/70 transition-[color,opacity,transform,translate,scale,rotate] duration-300 hover:enabled:text-secondary aria-[current=true]:text-ink motion-reduce:transition-none"
        :class="index < active ? 'opacity-60' : ''"
        @click="line.timeMs !== null && emit('seek', line.timeMs)"
      >
        <span
          v-if="silentLine(line)"
          class="inline-flex h-[1.45em] items-center gap-[0.34em] align-top"
          data-testid="lyrics-pause"
        >
          <span
            v-for="(filled, at) in index === active && pause ? pause : [0, 0, 0]"
            :key="at"
            class="inline-block size-[0.3em] rounded-full"
            :class="{ 'motion-safe:animate-pulse': index === active && filled > 0 && filled < 1 }"
            :data-fill="index === active ? filled.toFixed(2) : undefined"
            :style="dot(filled)"
          />
        </span>
        <template v-else>{{ line.text }}</template>
      </button>
    </template>
    <div v-else class="text-body leading-[1.55] whitespace-pre-line text-secondary">
      <p v-for="(line, index) in lyrics.lines" :key="index" class="m-0 min-h-[1lh]">{{ line.text }}</p>
    </div>
    <p v-if="lyrics && source" class="mt-20 mb-0 text-footnote text-muted">{{ source }}</p>
  </div>
</template>
