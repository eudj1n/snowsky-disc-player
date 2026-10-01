/** Presentation state shared across the shell: the search palette, dialogs, toast. */
import { nextTick, reactive, readonly, shallowRef } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import type { SelectionTarget } from '../gateway/selection'
import { sameTrack, type Track } from '../domain/track'
import type { MessageKey } from '../i18n'

export type DialogName = 'connection' | 'sound' | 'import'
/**
 * The listening panel's sheets, without tabs (owner, 2026-10-02): what plays with its lyrics, the queue, a track
 * opened from a row (2026-09-30) and an artist's or album's details.
 */
export type PanelSection = 'now' | 'queue' | 'track' | 'info'
/** What the details panel (i) shows (owner, 2026-10-01): an artist, or an album by its key and scope. */
export type PanelInfo =
  { kind: 'artist'; name: string } | { kind: 'album'; key: string; title: string; scope: string | null }
/** What an opener asks for: a sheet, or the lyrics (the Now sheet at its lyrics). */
export type PanelTarget = PanelSection | 'lyrics'

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

/** A step of the top bar's breadcrumbs; the last one is the page itself. */
export interface Crumb {
  text: string
  to?: RouteLocationRaw
}

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
  /** The search palette (owner, 2026-09-30): the whole collection and the page's commands. */
  palette: false,
  dialog: null as DialogName | null,
  /** The dialog to come back to when this one closes (adding music opened the connection, 2026-10-01). */
  dialogReturn: null as DialogName | null,
  panel: null as PanelSection | null,
  /** What the panel was opened for; the lyrics ask the Now sheet to scroll to them. */
  panelTarget: null as PanelTarget | null,
  /** The sheet the close button leads back to: the full-screen player that opened the queue (phones). */
  panelReturn: null as PanelSection | null,
  /** The track a row's title opened in the panel, with what its Play selects. */
  panelTrack: null as { track: Track; play: SelectionTarget | null; playlist: string | null } | null,
  /** The artist or album the details panel shows. */
  panelInfo: null as PanelInfo | null,
  /** Increments each time an opener asks for a sheet or the lyrics, so the panel can show the place asked for. */
  panelRequest: 0,
  toast: null as Toast | null,
  trackMenu: null as TrackMenu | null,
  playlistDialog: null as PlaylistDialog | null,
  /** Karaoke: the current lyrics full screen (round 16). */
  karaoke: false,
  /** The visualizer: what plays in this browser, drawn full screen (2026-09-29). */
  visualizer: false,
  /** A cover shown in full size (owner, 2026-09-30); only observed covers, never the typographic sleeve. */
  cover: null as { blob: Blob; title: string } | null,
})
export const ui = readonly(state)

export function showCover(blob: Blob, title: string): void {
  state.cover = { blob, title }
}

export function closeCover(): void {
  state.cover = null
}

let toastTimer: ReturnType<typeof setTimeout> | undefined
let toastId = 0

/** The breadcrumbs a page gave for its path (owner, 2026-09-30); others show their section. */
const crumbs = shallowRef<{ owner: object; path: string; items: Crumb[] } | null>(null)

export function setCrumbs(owner: object, path: string, items: Crumb[]): void {
  crumbs.value = { owner, path, items }
}

/** Only the page that gave the crumbs takes them away. */
export function clearCrumbs(owner: object): void {
  if (crumbs.value?.owner === owner) crumbs.value = null
}

/** The crumbs given for this path, if any. */
export const pageCrumbs = (path: string): Crumb[] | null =>
  crumbs.value && crumbs.value.path === path ? crumbs.value.items : null

export function openPalette(): void {
  state.palette = true
}

export function closePalette(): void {
  state.palette = false
}

export function openDialog(name: DialogName, returnTo: DialogName | null = null): void {
  state.dialog = name
  state.dialogReturn = returnTo
}

export function setKaraoke(open: boolean): void {
  state.karaoke = open
}

export function setVisualizer(open: boolean): void {
  state.visualizer = open
}

export function closeDialog(): void {
  state.dialog = state.dialogReturn
  state.dialogReturn = null
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
 * shown closes it, another opener switches to its sheet. The lyrics opener
 * shows the Now sheet at the lyrics. Explicit closes return focus to the opener.
 */
export function togglePanel(target: PanelTarget, opener: HTMLElement | null): void {
  if (state.panel !== null && state.panelTarget === target) {
    closePanel(true)
    return
  }
  if (state.panel === null) panelOpener = opener
  state.panel = target === 'lyrics' ? 'now' : target
  state.panelTarget = target
  state.panelReturn = null
  state.panelRequest++
}

/** The queue from the full-screen player (phones, where the bar hides): its sheet leads back to the player. */
export function openQueueSheet(): void {
  state.panelReturn = state.panel
  state.panel = 'queue'
  state.panelTarget = 'queue'
  state.panelRequest++
}

/** The sheet's close button and Escape: back to the sheet that opened this one, else the panel closes. */
export function leaveSheet(): void {
  const back = state.panelReturn
  if (!back) {
    closePanel(true)
    return
  }
  state.panel = back
  state.panelTarget = back
  state.panelReturn = null
  state.panelRequest++
}

/**
 * A row's title opens its track in the panel (owner, 2026-09-30); the same title again closes it,
 * another switches to that track.
 */
export function openTrackPanel(
  track: Track,
  play: SelectionTarget | null,
  opener: HTMLElement | null,
  playlist: string | null = null,
): void {
  if (state.panel === 'track' && state.panelTrack && sameTrack(state.panelTrack.track, track)) {
    closePanel(true)
    return
  }
  if (state.panel === null) panelOpener = opener
  state.panelTrack = { track: { ...track }, play, playlist }
  state.panel = 'track'
  state.panelTarget = 'track'
  state.panelReturn = null
}

const sameInfo = (a: PanelInfo, b: PanelInfo): boolean =>
  a.kind === 'artist'
    ? b.kind === 'artist' && a.name === b.name
    : b.kind === 'album' && a.key === b.key && a.scope === b.scope

/** The details (i) of an artist or album in the panel; the same button again closes it. */
export function openInfoPanel(info: PanelInfo, opener: HTMLElement | null): void {
  if (state.panel === 'info' && state.panelInfo && sameInfo(state.panelInfo, info)) {
    closePanel(true)
    return
  }
  if (state.panel === null) panelOpener = opener
  state.panelInfo = { ...info }
  state.panel = 'info'
  state.panelTarget = 'info'
  state.panelReturn = null
}

export function closePanel(restoreFocus: boolean): void {
  state.panel = null
  state.panelTarget = null
  state.panelReturn = null
  state.panelTrack = null
  state.panelInfo = null
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
