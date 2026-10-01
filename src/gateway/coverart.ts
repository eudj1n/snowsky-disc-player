/**
 * Front covers from Cover Art Archive (owner, 2026-09-29: the only cover
 * source). An image answers with a redirect to archive.org and then to a
 * download host; the browser follows them (the release's origins admit all
 * three). The bytes are checked as JPEG or PNG within the page's bound, as
 * the card's own covers are. A release without a front cover falls back to
 * its release group's.
 */
import { coverType, MAX_COVER_BYTES } from './artwork'

const BASE = 'https://coverartarchive.org'
const TIMEOUT_MS = 30_000

/** Cover Art Archive or its image hosts could not be reached (archive.org may be blocked on this network). */
export class CoverUnreachable extends Error {}

async function front(url: string, fetchImpl: typeof fetch): Promise<Blob | null> {
  let response: Response
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), credentials: 'omit' })
  } catch {
    throw new CoverUnreachable(url)
  }
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Cover Art Archive answered ${String(response.status)}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  const type = bytes.length && bytes.length <= MAX_COVER_BYTES ? coverType(bytes) : null
  return type ? new Blob([bytes], { type }) : null
}

/** The release's front cover (500 px), else its release group's; null when neither has one. */
export async function frontCover(
  release: { id: string; group: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<Blob | null> {
  const own = await front(`${BASE}/release/${encodeURIComponent(release.id)}/front-500`, fetchImpl)
  if (own || !release.group) return own
  return front(`${BASE}/release-group/${encodeURIComponent(release.group)}/front-500`, fetchImpl)
}

/** Where an edition's own front cover is, small for the choice (250 px) and for the card (500 px). */
export const releaseFront = (release: string, size: 250 | 500): string =>
  `${BASE}/release/${encodeURIComponent(release)}/front-${String(size)}`

/** An edition's own front cover by its address; null when it has none. */
export const coverBytes = (url: string, fetchImpl: typeof fetch = fetch): Promise<Blob | null> => front(url, fetchImpl)
