/**
 * Modal dialog behavior from the reference (dialogs.mjs): while any dialog is
 * open the page is fixed at its scroll position; closing the last one
 * restores it unless the URL changed. A backdrop click closes a dialog only
 * when a primary press starts and ends outside its box with at most 8px of
 * movement, so inner padding clicks and drag-outs never dismiss it.
 */
const open = new Set<HTMLDialogElement>()
let saved: { x: number; y: number; url: string } | null = null

function sync(): void {
  const root = document.documentElement
  if (open.size && !saved) {
    saved = { x: scrollX, y: scrollY, url: location.href }
    root.style.setProperty('--dialog-scroll-y', `${-saved.y}px`)
    root.classList.add('modal-open')
  } else if (!open.size && saved) {
    const previous = saved
    saved = null
    root.classList.remove('modal-open')
    root.style.removeProperty('--dialog-scroll-y')
    const samePage = previous.url === location.href
    scrollTo({ left: samePage ? previous.x : 0, top: samePage ? previous.y : 0, behavior: 'instant' })
  }
}

export function trackOpen(dialog: HTMLDialogElement, isOpen: boolean): void {
  if (isOpen) open.add(dialog)
  else open.delete(dialog)
  sync()
}

function outside(dialog: HTMLDialogElement, event: MouseEvent): boolean {
  if (event.target !== dialog) return false
  const box = dialog.getBoundingClientRect()
  return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom
}

/** Wires backdrop dismissal; returns a cleanup function. */
export function backdropDismissal(dialog: HTMLDialogElement, dismiss: () => void): () => void {
  let press: { x: number; y: number } | null = null
  const down = (event: PointerEvent) => {
    press =
      event.button === 0 && event.isPrimary && outside(dialog, event) ? { x: event.clientX, y: event.clientY } : null
  }
  const click = (event: MouseEvent) => {
    const start = press
    press = null
    if (start && outside(dialog, event) && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 8) dismiss()
  }
  dialog.addEventListener('pointerdown', down)
  dialog.addEventListener('click', click)
  return () => {
    dialog.removeEventListener('pointerdown', down)
    dialog.removeEventListener('click', click)
  }
}
