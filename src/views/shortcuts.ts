/**
 * Keyboard shortcuts (owner's decision, proposal 2): Space plays or pauses,
 * Left/Right select the previous/next track, "/" focuses search (reference).
 * Ignored while typing, on focused controls (Space activates them) and while
 * a dialog is open.
 */
import { connection } from '../stores/connection'
import { transport } from '../stores/controls'
import { playback } from '../stores/playback'

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
  const action =
    event.key === ' ' ? 'toggle' : event.key === 'ArrowLeft' ? 'previous' : event.key === 'ArrowRight' ? 'next' : null
  if (!action || target?.closest(INTERACTIVE)) return
  if (connection.connection !== 'connected' || !playback.current.track) return
  event.preventDefault()
  void transport(action)
}
