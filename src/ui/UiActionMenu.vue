<script setup lang="ts">
/**
 * Rare actions behind a round "⋯" button (owner, 2026-09-30): renaming or
 * deleting a playlist, an automatic list's period, updating or removing it.
 * A popover under the button, a bottom sheet on narrow screens. Arrow keys
 * move through the enabled items, Home and End jump, Escape closes; choosing
 * an item closes the menu first and returns focus to the button. Items with
 * `checked` are the options of one choice (radio items with a check).
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import UiCircleButton from './UiCircleButton.vue'
import UiIcon from './UiIcon.vue'
import { backdropDismissal, trackOpen } from './dialogs'
import type { IconName } from './icons'

export interface ActionItem {
  id: string
  label: string
  icon?: IconName
  enabled?: boolean
  /** One option of a choice: shown with a check when chosen. */
  checked?: boolean
  /** A destructive action, in the notice colour. */
  danger?: boolean
  /** A heading shown before the item (the start of a choice). */
  group?: string
  /** A rule before the item. */
  separator?: boolean
}

// Two roots (the button and its menu): attributes such as a test id go to the button.
defineOptions({ inheritAttrs: false })
defineProps<{ label: string; items: readonly ActionItem[]; disabled?: boolean }>()
const emit = defineEmits<{ choose: [id: string] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const trigger = ref<InstanceType<typeof UiCircleButton> | null>(null)
const position = ref({ x: 0, y: 0 })

const button = () => trigger.value?.$el as HTMLElement | undefined

async function open(): Promise<void> {
  const element = dialog.value
  const anchor = button()
  if (!element || !anchor || element.open) return
  element.showModal()
  trackOpen(element, true)
  await nextTick()
  const box = anchor.getBoundingClientRect()
  const { width, height } = element.getBoundingClientRect()
  const below = box.bottom + 8
  const y = below + height <= innerHeight - 12 ? below : Math.max(12, box.top - height - 8)
  position.value = { x: Math.max(12, Math.min(innerWidth - width - 12, box.right - width)), y }
  element.querySelector<HTMLButtonElement>('[role^=menuitem]:not(:disabled)')?.focus()
}

function close(): void {
  const element = dialog.value
  if (element?.open) element.close()
}

function choose(id: string): void {
  close()
  emit('choose', id)
}

function move(event: KeyboardEvent): void {
  const buttons = [...(dialog.value?.querySelectorAll<HTMLButtonElement>('[role^=menuitem]:not(:disabled)') ?? [])]
  if (!buttons.length) return
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next =
    event.key === 'ArrowDown'
      ? (index + 1) % buttons.length
      : event.key === 'ArrowUp'
        ? (index - 1 + buttons.length) % buttons.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : null
  if (next === null) return
  event.preventDefault()
  buttons[next]?.focus()
}

let cleanup = (): void => undefined
onMounted(() => {
  const element = dialog.value
  if (!element) return
  cleanup = backdropDismissal(element, close)
  element.addEventListener('close', () => {
    trackOpen(element, false)
    button()?.focus({ preventScroll: true })
  })
})
onBeforeUnmount(() => {
  cleanup()
  close()
})
defineExpose({ open })
</script>

<template>
  <UiCircleButton
    v-bind="$attrs"
    ref="trigger"
    icon="more"
    :label="label"
    :disabled="disabled"
    aria-haspopup="menu"
    @click="open"
  />
  <dialog
    ref="dialog"
    :aria-label="label"
    :style="{ '--menu-x': `${position.x}px`, '--menu-y': `${position.y}px` }"
    class="fixed [inset:var(--menu-y)_auto_auto_var(--menu-x)] m-0 w-max max-w-320 min-w-240 rounded-18 border border-line bg-paper p-8 text-ink shadow-[0_18px_70px_#0004] backdrop:bg-[#0002] sheet:[inset:auto_10px_12px] sheet:w-[calc(100%-20px)] sheet:max-w-none sheet:rounded-22 sheet:p-12"
    @keydown="move"
  >
    <div role="menu" :aria-label="label">
      <template v-for="item in items" :key="item.id">
        <div v-if="item.separator" role="separator" class="mx-10 my-6 h-1 bg-line" />
        <p v-if="item.group" class="m-0 px-12 pt-8 pb-4 text-caption2 font-semibold tracking-caps text-muted uppercase">
          {{ item.group }}
        </p>
        <button
          type="button"
          :role="item.checked === undefined ? 'menuitem' : 'menuitemradio'"
          :aria-checked="item.checked === undefined ? undefined : item.checked"
          :disabled="item.enabled === false"
          class="flex w-full items-center gap-12 rounded-9 px-12 py-10 text-left text-body focus-visible:bg-hover hover:enabled:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
          :class="item.danger ? 'text-notice' : 'text-ink'"
          @click="choose(item.id)"
        >
          <UiIcon v-if="item.icon" :name="item.icon" class="size-18" />
          <span v-else-if="item.checked !== undefined" class="grid size-18 place-items-center">
            <UiIcon v-if="item.checked" name="check" class="size-16 text-accent" />
          </span>
          <span class="flex-1">{{ item.label }}</span>
        </button>
      </template>
    </div>
  </dialog>
</template>
