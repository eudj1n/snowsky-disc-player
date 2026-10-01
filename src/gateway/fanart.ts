/**
 * fanart.tv (owner, 2026-10-01): artist photos ("artistthumb"), wide
 * backgrounds ("artistbackground") and album covers by release group, all
 * keyed by MusicBrainz ids. Every request carries a key, the owner's personal
 * one entered in Settings; without it the source is not asked. Images are
 * fan-made under CC BY 3.0, so the page names fanart.tv beside them. The API
 * and the image host answer any origin; a small preview of every image
 * (`/preview/` instead of `/fanart/`) serves the choice before the full one
 * is read.
 */
import { coverType, MAX_COVER_BYTES } from './artwork'

const BASE = 'https://webservice.fanart.tv/v3/music'
const TIMEOUT_MS = 20_000
export const FANART_SITE = 'https://fanart.tv'
export const FANART_LICENSE = { name: 'CC BY 3.0', url: 'https://creativecommons.org/licenses/by/3.0/' }

export interface FanartImage {
  id: string
  url: string
  preview: string
  likes: number
}

export interface FanartArtist {
  thumbs: FanartImage[]
  backgrounds: FanartImage[]
  /** Album covers by MusicBrainz release group id. */
  covers: Record<string, FanartImage[]>
}

/** The key the owner entered was refused (401); a key is not retried. */
export class FanartKeyRefused extends Error {}

const ASSETS = /^https:\/\/assets\.fanart\.tv\/fanart\//

/** The small copy fanart.tv keeps of every image. */
export const fanartPreview = (url: string): string => url.replace(ASSETS, 'https://assets.fanart.tv/preview/')

function images(value: unknown): FanartImage[] {
  if (!Array.isArray(value)) return []
  return value
    .flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return []
      const { id, url, likes } = item as Record<string, unknown>
      if (typeof url !== 'string' || !ASSETS.test(url)) return []
      return [{ id: typeof id === 'string' ? id : url, url, preview: fanartPreview(url), likes: Number(likes) || 0 }]
    })
    .sort((a, b) => b.likes - a.likes)
}

/** An artist's images, most liked first; null when fanart.tv has none. Throws when it cannot answer. */
export async function fanartArtist(
  mbid: string,
  key: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FanartArtist | null> {
  const response = await fetchImpl(`${BASE}/${encodeURIComponent(mbid)}?${new URLSearchParams({ api_key: key })}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    credentials: 'omit',
  })
  if (response.status === 401) throw new FanartKeyRefused('fanart.tv refused the key')
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`fanart.tv answered ${String(response.status)}`)
  const body = (await response.json()) as Record<string, unknown>
  const albums = body.albums && typeof body.albums === 'object' ? (body.albums as Record<string, unknown>) : {}
  const covers = Object.fromEntries(
    Object.entries(albums)
      .map(([group, album]) => [group, images((album as Record<string, unknown> | null)?.albumcover)] as const)
      .filter(([, list]) => list.length > 0),
  )
  const found = { thumbs: images(body.artistthumb), backgrounds: images(body.artistbackground), covers }
  return found.thumbs.length || found.backgrounds.length || Object.keys(covers).length ? found : null
}

/** An image's bytes, JPEG or PNG by their signature and bounded like a cover. */
export async function fanartBytes(url: string, fetchImpl: typeof fetch = fetch): Promise<Blob | null> {
  if (!/^https:\/\/assets\.fanart\.tv\/(fanart|preview)\//.test(url)) return null
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), credentials: 'omit' })
  if (!response.ok) return null
  const bytes = new Uint8Array(await response.arrayBuffer())
  const type = bytes.length && bytes.length <= MAX_COVER_BYTES ? coverType(bytes) : null
  return type ? new Blob([bytes], { type }) : null
}
