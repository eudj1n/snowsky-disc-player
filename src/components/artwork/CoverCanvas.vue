<script setup lang="ts">
/**
 * Observed cover art drawn on a canvas. The gateway CSP allows no blob: or
 * data: image URLs, so the bytes are decoded with createImageBitmap and drawn
 * with object-fit: cover semantics at the device pixel ratio. The drawing
 * fades in once decoded; with `tone`, the image's two colours are emitted
 * for tinting around it.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { coverColours, type CoverColours } from '../../domain/coverColours'

const props = withDefaults(defineProps<{ blob: Blob; tone?: boolean }>(), { tone: false })
const emit = defineEmits<{ tone: [colours: CoverColours] }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const drawn = ref(false)
let bitmap: ImageBitmap | null = null
let observer: ResizeObserver | null = null

function draw(): void {
  const element = canvas.value
  const context = element?.getContext('2d')
  if (!element || !context || !bitmap) return
  const ratio = devicePixelRatio || 1
  const width = Math.max(1, Math.round(element.clientWidth * ratio))
  const height = Math.max(1, Math.round(element.clientHeight * ratio))
  element.width = width
  element.height = height
  const scale = Math.max(width / bitmap.width, height / bitmap.height)
  const w = bitmap.width * scale
  const h = bitmap.height * scale
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, (width - w) / 2, (height - h) / 2, w, h)
  drawn.value = true
}

/** The cover's two colours for the page's backgrounds (domain/coverColours.ts), from a 48×48 copy. */
function sampleColours(image: ImageBitmap): CoverColours | null {
  const probe = document.createElement('canvas')
  probe.width = probe.height = 48
  const context = probe.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(image, 0, 0, 48, 48)
  return coverColours(context.getImageData(0, 0, 48, 48).data)
}

async function decode(blob: Blob): Promise<void> {
  try {
    const next = await createImageBitmap(blob)
    bitmap?.close()
    bitmap = next
    draw()
    if (props.tone) {
      const colours = sampleColours(next)
      if (colours) emit('tone', colours)
    }
  } catch {
    bitmap = null
  }
}

onMounted(() => {
  void decode(props.blob)
  if (canvas.value) {
    observer = new ResizeObserver(draw)
    observer.observe(canvas.value)
  }
})
watch(
  () => props.blob,
  (blob) => void decode(blob),
)
onBeforeUnmount(() => {
  observer?.disconnect()
  bitmap?.close()
})
</script>

<template>
  <canvas
    ref="canvas"
    aria-hidden="true"
    class="block size-full will-change-transform [transition:opacity_400ms_ease-out,scale_800ms_cubic-bezier(.22,.61,.36,1)] motion-reduce:transition-none"
    :class="drawn ? 'opacity-100' : 'opacity-0'"
  />
</template>
