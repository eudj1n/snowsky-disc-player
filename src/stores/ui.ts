/** Presentation state shared across the shell: search query, dialogs, toast. */
import { nextTick, reactive, readonly } from 'vue'
import type { SelectionTarget } from '../gateway/selection'
import type { Track } from '../domain/track'
import type { MessageKey } from '../i18n'

export type DialogName = 'connection' | 'appearance' | 'sound' | 'import'
/** The listening panel's tabs (owner, 2026-09-29: the queue joined Now). */
export type PanelSection = 'now' | 'lyrics'
/** What an opener asks for: a tab, or the queue (the Now tab scrolled to it). */
export type PanelTarget = PanelSection | 'queue'

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
  /** Values for the message's placeholders ("{position}"). */
  params: Record<string, string | number>
  error: boolean
  /** Announced only (sr-only), not drawn. */
  quiet: boolean
  id: number
}

const state = reactive({
  query: '',
  dialog: null as DialogName | null,
  panel: null as PanelSection | null,
  /** What the panel was opened for; the queue asks the Now tab to scroll to it. */
  panelTarget: null as PanelTarget | null,
  /** Increments each time an opener asks for the queue. */
  queueRequest: 0,
  toast: null as Toast | null,
  trackMenu: null as TrackMenu | null,
  playlistDialog: null as PlaylistDialog | null,
  /** Karaoke: the current lyrics full screen (round 16). */
  karaoke: false,
  /** The visualizer: what plays in this browser, drawn full screen (2026-09-29). */
  visualizer: false,
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

export function setKaraoke(open: boolean): void {
  state.karaoke = open
}

export function setVisualizer(open: boolean): void {
  state.visualizer = open
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

export function toast(key: MessageKey, error = false, params: Record<string, string | number> = {}): void {
  clearTimeout(toastTimer)
  state.toast = { key, params, error, quiet: !error && QUIET.includes(key), id: ++toastId }
  toastTimer = setTimeout(() => (state.toast = null), error ? 11_000 : 4_500)
}

let panelOpener: HTMLElement | null = null

/**
 * The listening panel (reference toggleListeningPanel): the opener of what is
 * shown closes it, another opener switches to its tab. The queue opener shows
 * the Now tab at the queue. Explicit closes return focus to the opener.
 */
export function togglePanel(target: PanelTarget, opener: HTMLElement | null): void {
  if (state.panel !== null && state.panelTarget === target) {
    closePanel(true)
    return
  }
  if (state.panel === null) panelOpener = opener
  state.panel = target === 'queue' ? 'now' : target
  state.panelTarget = target
  if (target === 'queue') state.queueRequest++
}

export function showPanelSection(section: PanelSection): void {
  state.panel = section
  state.panelTarget = section
}

export function closePanel(restoreFocus: boolean): void {
  state.panel = null
  state.panelTarget = null
  // On phones the opener's bar hides while the panel is open: focus it once it is back.
  const opener = panelOpener
  if (restoreFocus && opener) void nextTick(() => opener.focus({ preventScroll: true }))
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
