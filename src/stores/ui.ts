/** Presentation state shared across the shell: search query, dialogs, toast. */
import { reactive, readonly } from 'vue'
import type { SelectionTarget } from '../gateway/selection'
import type { Track } from '../domain/track'
import type { MessageKey } from '../i18n'

export type DialogName = 'connection' | 'appearance' | 'sound' | 'import'
export type PanelSection = 'now' | 'lyrics' | 'queue'

/** The open track actions menu: the row's track, what Play selects, and
 * where to anchor (reference openTrackMenu: right-aligned below the ⋯). */
export interface TrackMenu {
  track: Track
  play: SelectionTarget | null
  /** The playlist the row belongs to, when opened from a playlist page. */
  playlist: string | null
  x: number
  y: number
}

/** The playlist dialog: create, rename, delete, add tracks or remove one. */
export type PlaylistDialog =
  | { mode: 'create' }
  | { mode: 'rename'; playlist: string }
  | { mode: 'delete'; playlist: string }
  | { mode: 'add'; tracks: Track[]; title: string }
  | { mode: 'remove'; playlist: string; track: Track }
  | { mode: 'unfavorite'; track: Track }

interface Toast {
  key: MessageKey
  error: boolean
  /** Announced only (sr-only), not drawn. */
  quiet: boolean
  id: number
}

const state = reactive({
  query: '',
  dialog: null as DialogName | null,
  panel: null as PanelSection | null,
  toast: null as Toast | null,
  trackMenu: null as TrackMenu | null,
  playlistDialog: null as PlaylistDialog | null,
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
/**
 * Confirmations the page already shows (the track plays, the heart fills, the
 * level moves): announced to assistive technology only, never drawn (owner,
 * round 9). Errors, uncertain outcomes and "please wait" stay visible.
 */
const QUIET: readonly MessageKey[] = ['done_verified_on_disc', 'already_set']

export function toast(key: MessageKey, error = false): void {
  clearTimeout(toastTimer)
  state.toast = { key, error, quiet: !error && QUIET.includes(key), id: ++toastId }
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

export function openTrackMenu(
  track: Track,
  play: SelectionTarget | null,
  anchor: HTMLElement,
  playlist: string | null = null,
): void {
  const rect = anchor.getBoundingClientRect()
  state.trackMenu = {
    track,
    play,
    playlist,
    x: Math.max(12, Math.min(innerWidth - 332, rect.right - 320)),
    y: Math.max(12, Math.min(innerHeight - 370, rect.bottom + 6)),
  }
}

export function closeTrackMenu(): void {
  state.trackMenu = null
}

export function openPlaylistDialog(dialog: PlaylistDialog): void {
  state.playlistDialog = dialog
}

export function closePlaylistDialog(): void {
  state.playlistDialog = null
}
