/**
 * Entering and leaving karaoke (round 16). Full screen is asked for on the
 * whole page from the user's own click or key press (browsers require one);
 * where it is refused (iOS Safari) the overlay still covers the window.
 * Leaving full screen by the browser's own Esc also leaves karaoke.
 */
import { ui, setKaraoke } from '../stores/ui'

let ownFullscreen = false
/** Set while the karaoke itself toggles full screen, so that change does not close it. */
let toggling = false

function onFullscreenChange(): void {
  if (toggling) {
    toggling = false
    return
  }
  if (!document.fullscreenElement && ownFullscreen) {
    ownFullscreen = false
    setKaraoke(false)
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

export function openKaraoke(): void {
  if (ui.karaoke) return
  setKaraoke(true)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  void requestFullscreen()
}

export function closeKaraoke(): void {
  if (!ui.karaoke) return
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  setKaraoke(false)
  if (ownFullscreen && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
  ownFullscreen = false
  toggling = false
}

/** The full-screen button inside karaoke: in or out, karaoke stays open. */
export async function toggleKaraokeFullscreen(): Promise<void> {
  if (document.fullscreenElement) {
    toggling = true
    ownFullscreen = false
    await document.exitFullscreen().catch(() => {
      toggling = false
    })
  } else {
    await requestFullscreen()
  }
}
