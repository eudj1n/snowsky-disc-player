/**
 * An artist's photo from Wikimedia (owner, 2026-09-29, enrichment step 3):
 * the file MusicBrainz links as the artist's image, else the image
 * (property P18) of the artist's Wikidata item, described by Wikimedia
 * Commons with its author and licence, and its thumbnail read as bytes (the
 * page draws pictures on a canvas). Anonymous requests: `origin=*` makes the
 * Commons API answer across origins; Wikidata's entity data and the upload
 * host allow any origin.
 */
import { coverType, MAX_COVER_BYTES } from './artwork'

const TIMEOUT_MS = 20_000

export interface CommonsImage {
  /** The thumbnail to read. */
  url: string
  /** The file's page on Commons, for the attribution link. */
  page: string | null
  author: string | null
  license: string | null
  licenseUrl: string | null
}

/** Visible text of the small HTML Commons keeps in its metadata (authors are often links). */
export function plainText(html: string): string {
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
  return text.replace(/\s+/g, ' ').trim()
}

async function json(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), credentials: 'omit' })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Wikimedia answered ${String(response.status)}`)
  return response.json()
}

/** The Commons file name of a Wikidata item's image (P18), or null. */
export async function wikidataImage(item: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!/^Q\d+$/.test(item)) return null
  const data = (await json(`https://www.wikidata.org/wiki/Special:EntityData/${item}.json`, fetchImpl)) as {
    entities?: Record<string, { claims?: { P18?: { mainsnak?: { datavalue?: { value?: unknown } } }[] } }>
  } | null
  const entity = data?.entities?.[item] ?? Object.values(data?.entities ?? {})[0]
  const value = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value
  return typeof value === 'string' && value !== '' ? value : null
}

/** A Commons file's thumbnail (500 px wide), author and licence, or null when Commons has no such file. */
export async function commonsImage(file: string, fetchImpl: typeof fetch = fetch): Promise<CommonsImage | null> {
  const params = new URLSearchParams({
    action: 'query',
    titles: `File:${file}`,
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: '500',
    iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl',
    format: 'json',
    origin: '*',
  })
  const data = (await json(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, fetchImpl)) as {
    query?: { pages?: Record<string, { imageinfo?: Record<string, unknown>[] }> }
  } | null
  const info = Object.values(data?.query?.pages ?? {})[0]?.imageinfo?.[0]
  if (!info) return null
  const url = typeof info.thumburl === 'string' ? info.thumburl : typeof info.url === 'string' ? info.url : null
  if (!url || !url.startsWith('https://upload.wikimedia.org/')) return null
  const meta = (info.extmetadata ?? {}) as Record<string, { value?: unknown } | undefined>
  const field = (name: string) => {
    const value = meta[name]?.value
    return typeof value === 'string' && value.trim() !== '' ? plainText(value) : null
  }
  return {
    url,
    page: typeof info.descriptionurl === 'string' ? info.descriptionurl : null,
    author: field('Artist'),
    license: field('LicenseShortName'),
    licenseUrl: field('LicenseUrl'),
  }
}

/** The thumbnail's bytes, checked as JPEG or PNG within the page's bound; null otherwise. */
export async function imageBytes(url: string, fetchImpl: typeof fetch = fetch): Promise<Blob | null> {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), credentials: 'omit' })
  if (!response.ok) return null
  const bytes = new Uint8Array(await response.arrayBuffer())
  const type = bytes.length && bytes.length <= MAX_COVER_BYTES ? coverType(bytes) : null
  return type ? new Blob([bytes], { type }) : null
}
