/**
 * The tab's icon follows the current track's cover (owner, 2026-10-23), as
 * the title follows the track: the cover by the service's same-origin media
 * route, which the page's policy allows (`img-src 'self'`; a data: or blob:
 * icon would not pass), once the page has seen the cover, so the tab is not
 * sent after a cover that is not there. The page's own icon comes back when
 * no track is known or its album has no cover.
 */
import { watchEffect } from 'vue'
import { coverUrl } from '../gateway/media'
import { coverFor } from '../stores/enrichment'
import { nowPlaying } from '../stores/output'

/** The icon's address and type for the track: the cover's, or the page's own. */
export function faviconFor(
  track: { path: string | null } | null,
  cover: { type: string } | null,
  own: { href: string; type: string },
): { href: string; type: string } {
  return track?.path && cover ? { href: coverUrl(track.path), type: cover.type } : own
}

if (typeof document !== 'undefined') {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (link) {
    const own = { href: link.href, type: link.type }
    watchEffect(() => {
      const current = nowPlaying.value.track
      const icon = faviconFor(current, current ? coverFor(current) : null, own)
      if (link.href !== icon.href) link.href = icon.href
      if (link.type !== icon.type) link.type = icon.type
    })
  }
}
