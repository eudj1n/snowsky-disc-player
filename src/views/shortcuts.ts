/**
 * Keyboard shortcuts (owner's decision, proposal 2): Space plays or pauses,
 * Left/Right select the previous/next track, "/" focuses search (reference),
 * K opens or closes karaoke for the current track (round 16; the key, not
 * the letter, so it works in any keyboard layout), V the visualizer while
 * this browser plays (2026-09-29); one full-screen overlay at a time.
 * Ignored while typing, on focused controls (Space activates them) and while
 * a dialog is open.
 */
import { closeKaraoke, openKaraoke } from '../layout/karaoke'
import { closeVisualizer, openVisualizer } from '../layout/visualizer'
import { browserTrack, nextInBrowser, previousInBrowser, toggleBrowser } from '../stores/browser'
import { connection } from '../stores/connection'
import { transport } from '../stores/controls'
import { inBrowser, nowPlaying } from '../stores/output'
import { ui } from '../stores/ui'

const INTERACTIVE = 'input, textarea, select, button, a, [contenteditable], [role=menuitem], [role=slider]'

export function handleShortcut(event: KeyboardEvent): void {
  if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return
  const target = event.target as HTMLElement | null
  if (document.querySelector('dialog[open]')) return
  if (event.key === '/') {
    if (target?.closest('input, textarea, select, [contenteditable]')) return
    event.preventDefault()
    document.getElementById('search')?.focus()
    return
  }
  if (event.code === 'KeyK' && !event.shiftKey) {
    if (target?.closest('input, textarea, select, [contenteditable]')) return
    if (ui.visualizer || (!ui.karaoke && !nowPlaying.value.track)) return
    event.preventDefault()
    if (ui.karaoke) closeKaraoke()
    else openKaraoke()
    return
  }
  if (event.code === 'KeyV' && !event.shiftKey) {
    if (target?.closest('input, textarea, select, [contenteditable]')) return
    if (ui.karaoke || (!ui.visualizer && !browserTrack.value)) return
    event.preventDefault()
    if (ui.visualizer) closeVisualizer()
    else openVisualizer()
    return
  }
  const action =
    event.key === ' ' ? 'toggle' : event.key === 'ArrowLeft' ? 'previous' : event.key === 'ArrowRight' ? 'next' : null
  if (!action || target?.closest(INTERACTIVE)) return
  if (!nowPlaying.value.track) return
  if (inBrowser.value) {
    event.preventDefault()
    if (action === 'toggle') toggleBrowser()
    else if (action === 'next') nextInBrowser()
    else previousInBrowser()
    return
  }
  if (connection.connection !== 'connected') return
  event.preventDefault()
  void transport(action)
}
