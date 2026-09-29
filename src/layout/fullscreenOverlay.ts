/**
 * Full-screen overlays: karaoke (round 16) and the visualizer (2026-09-29).
 * Full screen is asked for on the whole page from the user's own click or key
 * press (browsers require one); where it is refused (iOS Safari) the overlay
 * still covers the window. Leaving full screen by the browser's own Esc also
 * closes the overlay.
 */

export interface FullscreenOverlay {
  open(): void
  close(): void
  /** The full-screen button inside the overlay: in or out, the overlay stays open. */
  toggleFullscreen(): Promise<void>
}

export function fullscreenOverlay(isOpen: () => boolean, setOpen: (open: boolean) => void): FullscreenOverlay {
  let ownFullscreen = false
  /** Set while the overlay itself toggles full screen, so that change does not close it. */
  let toggling = false

  function onFullscreenChange(): void {
    if (toggling) {
      toggling = false
      return
    }
    if (!document.fullscreenElement && ownFullscreen) {
      ownFullscreen = false
      setOpen(false)
    }
  }

  async function requestFullscreen(): Promise<void> {
    const root = document.documentElement
    if (document.fullscreenElement) return
    toggling = true
    // iOS Safari has no requestFullscreen for the page: the call throws and the overlay stays windowed.
    try {
      await root.requestFullscreen({ navigationUI: 'hide' })
      ownFullscreen = true
    } catch {
      toggling = false
    }
  }

  return {
    open() {
      if (isOpen()) return
      setOpen(true)
      document.addEventListener('fullscreenchange', onFullscreenChange)
      void requestFullscreen()
    },
    close() {
      if (!isOpen()) return
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      setOpen(false)
      if (ownFullscreen && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
      ownFullscreen = false
      toggling = false
    },
    async toggleFullscreen() {
      if (document.fullscreenElement) {
        toggling = true
        ownFullscreen = false
        await document.exitFullscreen().catch(() => {
          toggling = false
        })
      } else {
        await requestFullscreen()
      }
    },
  }
}
