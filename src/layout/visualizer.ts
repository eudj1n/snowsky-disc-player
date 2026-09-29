/**
 * Entering and leaving the visualizer (2026-09-29), full screen where the
 * browser allows it. It shows what plays in this browser, so it opens only
 * while something does. The analyser is made (or resumed) right here, inside
 * the user's click or key press: WebKit starts audio only from one.
 */
import { browserAnalyser, browserTrack } from '../stores/browser'
import { setVisualizer, ui } from '../stores/ui'
import { fullscreenOverlay } from './fullscreenOverlay'

const overlay = fullscreenOverlay(() => ui.visualizer, setVisualizer)

export function openVisualizer(): void {
  if (!browserTrack.value) return
  browserAnalyser()
  overlay.open()
}
export const closeVisualizer = (): void => overlay.close()
export const toggleVisualizerFullscreen = (): Promise<void> => overlay.toggleFullscreen()
