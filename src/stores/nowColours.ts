/**
 * The colours of what plays now (owner, 2026-09-30: the Now Playing panel on
 * the cover's colours, karaoke over them). The cover is decoded once per
 * blob; a track without a cover leaves the panel in the theme's colours.
 */
import { computed, ref, watch } from 'vue'
import { coverColours, deep, hex, type CoverColours } from '../domain/coverColours'
import { coverFor } from './enrichment'
import { nowPlaying } from './output'

const cache = new WeakMap<Blob, CoverColours>()

async function read(blob: Blob): Promise<CoverColours | null> {
  const known = cache.get(blob)
  if (known) return known
  try {
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 48
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    context.drawImage(bitmap, 0, 0, 48, 48)
    bitmap.close()
    const colours = coverColours(context.getImageData(0, 0, 48, 48).data)
    cache.set(blob, colours)
    return colours
  } catch {
    return null
  }
}

export const nowColours = ref<CoverColours | null>(null)
const nowCover = computed(() => (nowPlaying.value.track ? coverFor(nowPlaying.value.track) : null))
watch(
  nowCover,
  async (blob) => {
    if (!blob) {
      nowColours.value = null
      return
    }
    const colours = await read(blob)
    if (nowCover.value === blob) nowColours.value = colours
  },
  { immediate: true },
)

/** Custom properties of a surface on the cover's colours: two deep colours over a deeper base. */
export const nowColourStyle = computed(() => {
  const colours = nowColours.value
  if (!colours) return null
  return {
    '--cover-a': hex(deep(colours.first, 0.34)),
    '--cover-b': hex(deep(colours.second, 0.24)),
    '--cover-base': hex(deep(colours.first, 0.16)),
  }
})
