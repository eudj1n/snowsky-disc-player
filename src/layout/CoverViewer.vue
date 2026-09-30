<script setup lang="ts">
/**
 * A cover in full size (owner, 2026-09-30): the observed image at its own
 * pixels, fitted to the window when larger, with its size below. The gateway
 * CSP allows no blob: images, so it is drawn on a canvas (CoverCanvas) in a
 * box of the image's own proportions. Escape, the close button or a click
 * outside close it.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CoverCanvas from '../components/artwork/CoverCanvas.vue'
import { t } from '../i18n'
import { closeCover, ui } from '../stores/ui'
import { backdropDismissal, trackOpen } from '../ui/dialogs'
import UiIconButton from '../ui/UiIconButton.vue'

const dialog = ref<HTMLDialogElement | null>(null)
/** The image's own size, known once decoded. */
const size = ref<{ width: number; height: number } | null>(null)
let cleanup = (): void => undefined

async function measure(blob: Blob | undefined): Promise<void> {
  size.value = null
  if (!blob) return
  try {
    const bitmap = await createImageBitmap(blob)
    if (ui.cover?.blob === blob) size.value = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
  } catch {
    closeCover()
  }
}

function sync(open: boolean): void {
  const element = dialog.value
  if (!element) return
  if (open && !element.open) element.showModal()
  if (!open && element.open) element.close()
  trackOpen(element, open)
}

onMounted(() => {
  const element = dialog.value
  if (!element) return
  cleanup = backdropDismissal(element, closeCover)
  element.addEventListener('close', () => {
    trackOpen(element, false)
    if (ui.cover) closeCover()
  })
})
watch(
  () => ui.cover?.blob,
  (blob) => {
    void measure(blob)
    sync(blob !== undefined)
  },
)
onBeforeUnmount(() => {
  cleanup()
  if (dialog.value) trackOpen(dialog.value, false)
})
</script>

<template>
  <dialog
    ref="dialog"
    :aria-label="t('cover_viewer', { name: ui.cover?.title ?? '' })"
    class="m-auto max-h-none max-w-none overflow-visible bg-transparent p-0 text-white backdrop:bg-black/80 backdrop:backdrop-blur-[3px]"
    data-testid="cover-viewer"
  >
    <figure v-if="ui.cover && size" class="m-0 flex flex-col items-center gap-10">
      <div
        class="overflow-hidden rounded-8 shadow-[0_30px_100px_#0008]"
        :style="{
          aspectRatio: `${size.width} / ${size.height}`,
          width: `min(${size.width}px, 92vw, calc(84dvh * ${size.width} / ${size.height}))`,
        }"
      >
        <CoverCanvas :blob="ui.cover.blob" />
      </div>
      <figcaption class="flex items-center gap-12 text-12 text-white/80">
        <span class="max-w-[60vw] truncate font-semibold text-white">{{ ui.cover.title }}</span>
        <span data-testid="cover-size" class="tabular-nums">{{ size.width }} × {{ size.height }} px</span>
        <UiIconButton icon="close" :label="t('close')" class="text-white hover:bg-white/15" @click="closeCover" />
      </figcaption>
    </figure>
  </dialog>
</template>
