<script setup lang="ts">
/**
 * Lyrics of the current track, a part of the Now sheet below its head and
 * facts (owner, 2026-10-02: no Lyrics tab); the default slot takes the
 * heading and what finds lyrics. Synced lyrics highlight the line being sung,
 * and a line can be clicked to seek there. While the listener follows them
 * (the head scrolled away and the current line in view, or the bar's Lyrics
 * button asked), the sheet keeps the current line in its middle; a scroll by
 * hand that leaves the line out of view pauses that until the line is back in
 * view. A new track's lyrics keep a following listener at the lyrics. A pause
 * (an empty line, or a note or dots in the LRC) shows three dots, as karaoke
 * does (owner, 2026-09-29): the current pause fills them in turn until the
 * next line. Plain lyrics read as text. Lines are bold, as in karaoke, and
 * their text lines up with the heading: the hover background reaches into the
 * gutter (owner, 2026-09-30).
 */
import { computed, nextTick, onBeforeUnmount, ref, watch, type DeepReadonly } from 'vue'
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
  /** The sheet that scrolls the lyrics. */
  scroller: HTMLElement | null
  /** How much of the sheet's top the pinned line of the track covers; 0 while the head shows. */
  covered: number
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
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** Whether the sheet keeps the current line in view; the Now sheet opens at its head, not following. */
let following = false
/** Until when the sheet's scrolling is the lyrics' own (a smooth scroll takes a moment). */
let ownUntil = 0
/** When the listener last scrolled the sheet. */
let scrolledAt = 0
const line = (index: number) => box.value?.querySelector<HTMLElement>(`[data-line="${String(index)}"]`) ?? null

/** Whether the current line is in the sheet's view, or, without one, the lyrics fill its lower half. */
function inView(): boolean {
  const view = props.scroller?.getBoundingClientRect()
  if (!view || !box.value || !props.covered) return false
  const top = view.top + props.covered
  const current = active.value >= 0 ? line(active.value) : null
  if (current) {
    const rect = current.getBoundingClientRect()
    return rect.bottom > top && rect.top < view.bottom
  }
  const rect = box.value.getBoundingClientRect()
  return rect.top < top + (view.bottom - top) / 2 && rect.bottom > top
}

/** The pinned line of the track over the sheet's top, with a gap above the lyrics' heading. */
const PINNED = 72

/**
 * The lyrics at the top of the sheet, below the pinned line (the head folded away), and the current line,
 * once the lyrics get there, in the middle.
 */
async function reveal(smooth: boolean): Promise<void> {
  await nextTick()
  const scroller = props.scroller
  if (!scroller || !box.value) return
  const view = scroller.getBoundingClientRect()
  const offset = (element: HTMLElement) => element.getBoundingClientRect().top - view.top + scroller.scrollTop
  let top = offset(box.value) - PINNED
  const current = active.value >= 0 ? line(active.value) : null
  if (current) top = Math.max(top, offset(current) - (view.height - current.offsetHeight) / 2)
  ownUntil = Date.now() + 900
  scroller.scrollTo({ top, behavior: smooth && !reduced() ? 'smooth' : 'auto' })
}

/** The bar's Lyrics button: the current line (or the lyrics' start) in view, followed from now on. */
function follow(smooth: boolean): void {
  following = true
  void reveal(smooth)
}
defineExpose({ follow })

function onScroll(): void {
  if (Date.now() < ownUntil) return
  scrolledAt = Date.now()
  following = inView()
}
/* A hand on the sheet ends the lyrics' own scroll at once. */
function onHand(): void {
  ownUntil = 0
}
const HAND = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const
watch(
  () => props.scroller,
  (scroller, previous) => {
    previous?.removeEventListener('scroll', onScroll)
    for (const name of HAND) previous?.removeEventListener(name, onHand)
    scroller?.addEventListener('scroll', onScroll, { passive: true })
    for (const name of HAND) scroller?.addEventListener(name, onHand, { passive: true })
    // The sheet reaches its lyrics a render after they mount: what was asked for meanwhile happens now.
    if (scroller && following) void reveal(false)
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  props.scroller?.removeEventListener('scroll', onScroll)
  for (const name of HAND) props.scroller?.removeEventListener(name, onHand)
})

// Following playback smoothly, unless the listener is scrolling right now.
watch(active, () => {
  if (following && Date.now() - scrolledAt >= 1500) void reveal(true)
})
// A new track's lyrics (and its loading in between) keep a following listener at the lyrics.
watch(
  () => props.lyrics,
  () => {
    if (following) void reveal(false)
  },
)
</script>

<template>
  <!-- At least the sheet's height below the pinned line, so the head can always fold away above the lyrics. -->
  <div ref="box" class="min-h-[calc(100cqh-72px)]">
    <slot />
    <div data-testid="lyrics">
      <p v-if="!lyrics" class="m-0 text-footnote leading-[1.55] text-muted" role="status">{{ message }}</p>
      <template v-else-if="lyrics.synced">
        <button
          v-for="(item, index) in lyrics.lines"
          :key="index"
          type="button"
          :data-line="index"
          :aria-current="index === active ? 'true' : undefined"
          :aria-label="silentLine(item) ? seekLabel : undefined"
          :disabled="!seekable || item.timeMs === null"
          class="-mx-6 block w-[calc(100%+12px)] rounded-8 px-6 py-5 text-left text-title3 leading-[1.45] font-bold tracking-heading text-muted/70 transition-[color,opacity,transform,translate,scale,rotate] duration-300 hover:enabled:text-secondary aria-[current=true]:text-ink motion-reduce:transition-none"
          :class="index < active ? 'opacity-60' : ''"
          @click="item.timeMs !== null && emit('seek', item.timeMs)"
        >
          <span
            v-if="silentLine(item)"
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
          <template v-else>{{ item.text }}</template>
        </button>
      </template>
      <div v-else class="text-body leading-[1.55] whitespace-pre-line text-secondary">
        <p v-for="(item, index) in lyrics.lines" :key="index" class="m-0 min-h-[1lh]">{{ item.text }}</p>
      </div>
      <p v-if="lyrics && source" class="mt-20 mb-0 text-footnote text-muted">{{ source }}</p>
    </div>
  </div>
</template>
