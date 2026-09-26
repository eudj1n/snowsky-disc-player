<script setup lang="ts">
/**
 * Native modal dialog with the reference chrome (eyebrow + close) and
 * interaction rules (src/ui/dialogs.ts). Escape and focus return are native.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { backdropDismissal, trackOpen } from './dialogs'
import UiIconButton from './UiIconButton.vue'

const props = withDefaults(
  defineProps<{ open: boolean; eyebrow: string; closeLabel: string; wide?: boolean; size?: 'md' | 'lg' | 'xl' }>(),
  { wide: false, size: undefined },
)
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)
let cleanup = (): void => undefined

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
  cleanup = backdropDismissal(element, () => emit('close'))
  element.addEventListener('close', () => {
    trackOpen(element, false)
    if (props.open) emit('close')
  })
  sync(props.open)
})
watch(() => props.open, sync)
onBeforeUnmount(() => {
  cleanup()
  if (dialog.value) trackOpen(dialog.value, false)
})
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] overflow-auto overscroll-contain rounded-20 border border-line bg-paper p-30 text-ink shadow-[0_30px_100px_#27341c30] backdrop:bg-[#25301a50] backdrop:backdrop-blur-[5px] narrow:max-h-[calc(100dvh-20px)] narrow:w-[calc(100vw-20px)] narrow:p-22"
    :class="
      size === 'xl'
        ? 'max-w-690 px-32 py-28 text-left'
        : size === 'lg'
          ? 'max-w-620 px-32 py-28 text-left'
          : wide
            ? 'max-w-540 text-left'
            : 'max-w-430 text-center'
    "
  >
    <div class="flex items-center justify-between">
      <span class="text-10 font-[650] tracking-[1.8px] text-muted uppercase">{{ eyebrow }}</span>
      <UiIconButton icon="close" :label="closeLabel" @click="emit('close')" />
    </div>
    <slot />
  </dialog>
</template>
