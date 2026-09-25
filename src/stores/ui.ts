/** Presentation state shared across the shell: search query, dialogs, toast. */
import { reactive, readonly } from 'vue'
import type { SelectionTarget } from '../gateway/selection'
import type { Track } from '../domain/track'
import type { MessageKey } from '../i18n'

export type DialogName = 'connection' | 'appearance'
export type PanelSection = 'now' | 'queue'

/** The open track actions menu: the row's track, what Play selects, and
 * where to anchor (reference openTrackMenu: right-aligned below the ⋯). */
export interface TrackMenu {
  track: Track
  play: SelectionTarget | null
  x: number
  y: number
}

interface Toast {
  key: MessageKey
  error: boolean
  id: number
}

const state = reactive({
  query: '',
  dialog: null as DialogName | null,
  panel: null as PanelSection | null,
  toast: null as Toast | null,
  trackMenu: null as TrackMenu | null,
})
export const ui = readonly(state)

let toastTimer: ReturnType<typeof setTimeout> | undefined
let toastId = 0

export function setQuery(value: string): void {
  state.query = value
}

export function openDialog(name: DialogName): void {
  state.dialog = name
}

export function closeDialog(): void {
  state.dialog = null
}

/** One toast slot; 4.5 s, errors 11 s (reference app.js toast()). */
export function toast(key: MessageKey, error = false): void {
  clearTimeout(toastTimer)
  state.toast = { key, error, id: ++toastId }
  toastTimer = setTimeout(() => (state.toast = null), error ? 11_000 : 4_500)
}

let panelOpener: HTMLElement | null = null

/**
 * The listening panel (reference toggleListeningPanel): the opener of the
 * visible section closes it, the other switches section. Explicit closes
 * return focus to the opener.
 */
export function togglePanel(section: PanelSection, opener: HTMLElement | null): void {
  if (state.panel === section) {
    closePanel(true)
    return
  }
  if (state.panel === null) panelOpener = opener
  state.panel = section
}

export function showPanelSection(section: PanelSection): void {
  state.panel = section
}

export function closePanel(restoreFocus: boolean): void {
  state.panel = null
  if (restoreFocus) panelOpener?.focus({ preventScroll: true })
  panelOpener = null
}

export function openTrackMenu(track: Track, play: SelectionTarget | null, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect()
  state.trackMenu = {
    track,
    play,
    x: Math.max(12, Math.min(innerWidth - 332, rect.right - 320)),
    y: Math.max(12, Math.min(innerHeight - 370, rect.bottom + 6)),
  }
}

export function closeTrackMenu(): void {
  state.trackMenu = null
}
