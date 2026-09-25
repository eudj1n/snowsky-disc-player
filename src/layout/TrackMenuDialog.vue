<script setup lang="ts">
/**
 * Reference track actions menu (#track-dialog): a modal popover anchored to
 * the row's ⋯ button, a bottom sheet up to 700px. Arrow keys move through
 * enabled items with wrap-around, Home/End jump, Escape closes (native).
 * Activating an item closes the menu first.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Artwork from '../components/artwork/Artwork.vue'
import { coverFor } from '../stores/enrichment'
import { t } from '../i18n'
import { selection } from '../stores/selection'
import { closeTrackMenu, ui } from '../stores/ui'
import { backdropDismissal, trackOpen } from '../ui/dialogs'
import UiIcon from '../ui/UiIcon.vue'
import type { IconName } from '../ui/icons'
import UiIconButton from '../ui/UiIconButton.vue'
import { playFrom } from '../views/playAlbum'

const router = useRouter()
const dialog = ref<HTMLDialogElement | null>(null)
const menu = computed(() => ui.trackMenu)
const items = computed<{ id: string; icon: IconName; label: string; enabled: boolean }[]>(() => [
  { id: 'play', icon: 'play', label: t('play_label'), enabled: menu.value?.play != null && !selection.busy },
  { id: 'album', icon: 'album', label: t('go_to_album'), enabled: Boolean(menu.value?.track.album) },
  { id: 'artist', icon: 'artist', label: t('go_to_artist'), enabled: Boolean(menu.value?.track.artist) },
])
let cleanup = (): void => undefined

async function sync(open: boolean): Promise<void> {
  const element = dialog.value
  if (!element) return
  if (open && !element.open) {
    element.showModal()
    trackOpen(element, true)
    await nextTick()
    // Re-anchor with the real height, as the reference does after showModal.
    const current = menu.value
    if (current) {
      const height = element.getBoundingClientRect().height
      element.style.setProperty('--menu-y', `${Math.max(12, Math.min(innerHeight - height - 12, current.y))}px`)
    }
    element.querySelector<HTMLButtonElement>('[role=menuitem]:not(:disabled)')?.focus()
  } else if (!open && element.open) {
    element.close()
    trackOpen(element, false)
  }
}

function move(event: KeyboardEvent): void {
  const buttons = [...(dialog.value?.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)') ?? [])]
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

async function choose(id: string): Promise<void> {
  const current = menu.value
  closeTrackMenu()
  if (!current) return
  if (id === 'play' && current.play) await playFrom(current.play)
  if (id === 'album' && current.track.album) {
    // Keep the opening scope; otherwise the track's own artist separates homonymous albums.
    const scope = current.play?.kind === 'artistAlbum' ? current.play.artist : current.track.artist
    await router.push(
      scope
        ? { name: 'album', params: { name: current.track.album, artist: scope } }
        : { name: 'album', params: { name: current.track.album } },
    )
  }
  if (id === 'artist' && current.track.artist)
    await router.push({ name: 'artist', params: { name: current.track.artist } })
}

onMounted(() => {
  const element = dialog.value
  if (!element) return
  cleanup = backdropDismissal(element, closeTrackMenu)
  element.addEventListener('close', () => {
    trackOpen(element, false)
    if (menu.value) closeTrackMenu()
  })
})
watch(menu, (value) => void sync(value !== null))
onBeforeUnmount(() => cleanup())
</script>

<template>
  <dialog
    ref="dialog"
    :aria-label="t('track_actions')"
    :style="menu ? { '--menu-x': `${menu.x}px`, '--menu-y': `${menu.y}px` } : undefined"
    class="fixed [inset:var(--menu-y)_auto_auto_var(--menu-x)] m-0 w-320 rounded-18 border border-line bg-paper p-12 text-ink shadow-[0_18px_70px_#0004] backdrop:bg-[#0002] sheet:[inset:auto_10px_12px] sheet:w-[calc(100%-20px)] sheet:max-w-none sheet:rounded-22 sheet:p-16"
    @keydown="move"
  >
    <template v-if="menu">
      <div class="mb-8 flex items-center gap-12 px-3">
        <span class="size-44 shrink-0 overflow-hidden rounded-8"
          ><Artwork :title="menu.track.title" :cover="coverFor(menu.track)"
        /></span>
        <span class="min-w-0 flex-1">
          <strong class="block truncate text-13 font-semibold">{{ menu.track.title }}</strong>
          <small class="mt-3 block truncate text-11 text-muted">{{ menu.track.artist || '—' }}</small>
        </span>
        <UiIconButton icon="close" :label="t('close')" @click="closeTrackMenu" />
      </div>
      <div role="menu" :aria-label="t('track_actions')">
        <template v-for="item in items" :key="item.id">
          <div v-if="item.id === 'album'" role="separator" class="mx-10 my-7 h-1 bg-line" />
          <button
            type="button"
            role="menuitem"
            :disabled="!item.enabled"
            class="flex w-full items-center gap-13 rounded-9 p-12 text-left text-13 text-ink focus-visible:bg-hover hover:enabled:bg-hover disabled:cursor-not-allowed"
            @click="choose(item.id)"
          >
            <UiIcon :name="item.icon" class="size-18" />{{ item.label }}
          </button>
        </template>
      </div>
    </template>
  </dialog>
</template>
