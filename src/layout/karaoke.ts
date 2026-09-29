/** Entering and leaving karaoke (round 16), full screen where the browser allows it. */
import { setKaraoke, ui } from '../stores/ui'
import { fullscreenOverlay } from './fullscreenOverlay'

const overlay = fullscreenOverlay(() => ui.karaoke, setKaraoke)

export const openKaraoke = (): void => overlay.open()
export const closeKaraoke = (): void => overlay.close()
export const toggleKaraokeFullscreen = (): Promise<void> => overlay.toggleFullscreen()
