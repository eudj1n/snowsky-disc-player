/**
 * The mini player (owner, 2026-10-21): a small always-on-top window of the
 * browser's Document Picture-in-Picture, as Spotify's miniplayer. The window
 * is a document of our own origin, so MiniPlayer.vue teleports its content
 * there and the page's stylesheet links are copied in (links only: the
 * gateway's CSP allows no inline styles). Browsers offer the API in secure
 * contexts only (Chrome and Edge 116+): the hosted page and localhost have
 * it, the page from the card over plain http does not, and nothing here is
 * shown without it. Opening needs the user's own press, or the browser's
 * call to the media session's enterpictureinpicture action (automatic
 * picture-in-picture when the tab is left while this browser plays, once
 * the user has allowed it for the site). The browser closes the window by
 * itself when the page goes away.
 */
import { computed, shallowRef } from 'vue'
import { toast } from '../stores/ui'

interface PictureInPictureWindowOptions {
  width?: number
  height?: number
}
interface DocumentPictureInPicture {
  requestWindow(options?: PictureInPictureWindowOptions): Promise<Window>
  readonly window: Window | null
}

function api(): DocumentPictureInPicture | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture ?? null
}

export const miniPlayerSupported = api() !== null

/** The open window's body, where the mini player's content goes; null while closed. */
export const miniPlayerBody = shallowRef<HTMLElement | null>(null)
export const miniPlayerOpen = computed(() => miniPlayerBody.value !== null)

let opened: Window | null = null
let themeWatch: MutationObserver | null = null

/** The attributes public/theme.js and stores/appearance.ts keep on the page's root. */
const ROOT_ATTRIBUTES = ['lang', 'data-theme', 'data-light-palette', 'data-dark-palette', 'data-text-size']

function copyRoot(target: Document): void {
  for (const name of ROOT_ATTRIBUTES) {
    const value = document.documentElement.getAttribute(name)
    if (value === null) target.documentElement.removeAttribute(name)
    else target.documentElement.setAttribute(name, value)
  }
}

/** The page's stylesheets: a link to each sheet by its absolute address (the dev server's inline styles as they are). */
function copyStyles(target: Document): void {
  for (const sheet of Array.from(document.styleSheets)) {
    const node = sheet.ownerNode
    if (sheet.href) {
      const link = target.createElement('link')
      link.rel = 'stylesheet'
      link.href = sheet.href
      if (sheet.media.mediaText) link.media = sheet.media.mediaText
      target.head.append(link)
    } else if (node instanceof HTMLStyleElement) target.head.append(node.cloneNode(true))
  }
}

/** Opens the window, or brings the open one forward. False where the browser has no such window or refused it. */
export async function openMiniPlayer(): Promise<boolean> {
  const pip = api()
  if (!pip) return false
  if (opened && !opened.closed) {
    opened.focus()
    return true
  }
  let target: Window
  try {
    target = await pip.requestWindow({ width: 340, height: 560 })
  } catch (error) {
    // The browser said no (no user activation, a policy of its own): its reason, for the owner to act on.
    toast('mini_player_failed', true, { reason: error instanceof Error ? error.message : String(error) })
    return false
  }
  opened = target
  copyStyles(target.document)
  copyRoot(target.document)
  themeWatch = new MutationObserver(() => copyRoot(target.document))
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ROOT_ATTRIBUTES })
  target.addEventListener('pagehide', () => {
    if (opened !== target) return
    opened = null
    themeWatch?.disconnect()
    themeWatch = null
    miniPlayerBody.value = null
  })
  miniPlayerBody.value = target.document.body
  return true
}

export function closeMiniPlayer(): void {
  opened?.close()
}

export function toggleMiniPlayer(): void {
  if (miniPlayerOpen.value) closeMiniPlayer()
  else void openMiniPlayer()
}
