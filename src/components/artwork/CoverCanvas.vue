<script setup lang="ts">
/**
 * Observed cover art drawn on a canvas. The gateway CSP allows no blob: or
 * data: image URLs, so the bytes are decoded with createImageBitmap and drawn
 * with object-fit: cover semantics at the device pixel ratio.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ blob: Blob }>()
const canvas = ref<HTMLCanvasElement | null>(null)
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
}

async function decode(blob: Blob): Promise<void> {
  try {
    const next = await createImageBitmap(blob)
    bitmap?.close()
    bitmap = next
    draw()
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
  <canvas ref="canvas" aria-hidden="true" class="block size-full" />
</template>
