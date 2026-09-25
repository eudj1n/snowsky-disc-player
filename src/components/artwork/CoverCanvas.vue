<script setup lang="ts">
/**
 * Observed cover art drawn on a canvas. The gateway CSP allows no blob: or
 * data: image URLs, so the bytes are decoded with createImageBitmap and drawn
 * with object-fit: cover semantics at the device pixel ratio. The drawing
 * fades in once decoded; with `tone`, the image's average color is emitted
 * for tinting around it.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{ blob: Blob; tone?: boolean }>(), { tone: false })
const emit = defineEmits<{ tone: [color: string] }>()
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

/** Average color of the image, sampled on a tiny canvas. */
function sampleTone(image: ImageBitmap): string | null {
  const probe = document.createElement('canvas')
  probe.width = 8
  probe.height = 8
  const context = probe.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(image, 0, 0, 8, 8)
  const pixels = context.getImageData(0, 0, 8, 8).data
  let r = 0
  let g = 0
  let b = 0
  for (let i = 0; i < pixels.length; i += 4) {
    r += pixels[i] ?? 0
    g += pixels[i + 1] ?? 0
    b += pixels[i + 2] ?? 0
  }
  const n = pixels.length / 4
  return `rgb(${Math.round(r / n)} ${Math.round(g / n)} ${Math.round(b / n)})`
}

async function decode(blob: Blob): Promise<void> {
  try {
    const next = await createImageBitmap(blob)
    bitmap?.close()
    bitmap = next
    draw()
    if (props.tone) {
      const color = sampleTone(next)
      if (color) emit('tone', color)
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
    class="block size-full transition-[opacity,transform] duration-400 ease-out"
    :class="drawn ? 'opacity-100' : 'opacity-0'"
  />
</template>
