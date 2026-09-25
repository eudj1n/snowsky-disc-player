/**
 * Keyboard shortcuts (owner's decision, proposal 2): Space plays or pauses,
 * Left/Right select the previous/next track, "/" focuses search (reference).
 * Ignored while typing, on focused controls (Space activates them) and while
 * a dialog is open.
 */
import { playback, transport } from '../stores/playback'
import { pairing } from '../stores/pairing'
import { connection } from '../stores/connection'
import { toast } from '../stores/ui'

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
  if (!pairing.paired) {
    toast('pair_to_control')
    return
  }
  if (playback.busy) {
    toast('please_wait_for_the_current_request')
    return
  }
  void transport(action).then(() => {
    if (playback.uncertain) toast('result_unconfirmed_the_command_was_not_retried', true)
  })
}
