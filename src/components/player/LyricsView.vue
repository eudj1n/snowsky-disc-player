<script setup lang="ts">
/**
 * Lyrics of the current track. Synced lyrics highlight the line being sung
 * and keep it in view (unless the listener scrolled in the last few seconds);
 * a line can be clicked to seek there. Plain lyrics read as text.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type DeepReadonly } from 'vue'
import { activeLine, livePosition, type Lyrics } from '../../domain/lyrics'

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
const position = computed(() =>
  livePosition(props.positionMs, props.positionAt ?? null, now.value, props.playing ?? false),
)
const active = computed(() => (props.lyrics ? activeLine(props.lyrics as Lyrics, position.value) : -1))
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
    <p v-if="!lyrics" class="mt-24 text-12 leading-[1.7] text-muted" role="status">{{ message }}</p>
    <template v-else-if="lyrics.synced">
      <button
        v-for="(line, index) in lyrics.lines"
        :key="index"
        type="button"
        :data-line="index"
        :aria-current="index === active ? 'true' : undefined"
        :aria-label="line.text ? undefined : seekLabel"
        :disabled="!seekable || line.timeMs === null"
        class="phone:text-16 block w-full rounded-8 px-6 py-5 text-left text-17 leading-[1.45] font-semibold tracking-[-0.2px] text-muted/70 transition-[color,opacity,transform,translate,scale,rotate] duration-300 hover:enabled:text-secondary aria-[current=true]:text-ink motion-reduce:transition-none"
        :class="index < active ? 'opacity-60' : ''"
        @click="line.timeMs !== null && emit('seek', line.timeMs)"
      >
        {{ line.text || '♪' }}
      </button>
    </template>
    <div v-else class="text-14 leading-[1.7] whitespace-pre-line text-secondary">
      <p v-for="(line, index) in lyrics.lines" :key="index" class="m-0 min-h-[1lh]">{{ line.text }}</p>
    </div>
    <p v-if="lyrics && source" class="mt-20 mb-0 text-11 text-muted">{{ source }}</p>
  </div>
</template>
