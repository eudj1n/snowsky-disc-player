/**
 * MusicBrainz releases for an album (owner, 2026-09-29, enrichment step 2:
 * covers come only from Cover Art Archive, which is keyed by MusicBrainz
 * release). One search by the album's title and artist, at most one request
 * a second (MusicBrainz's rule for clients); only those names leave the
 * network. No key and no custom header (a simple CORS GET).
 */

export interface ReleaseCandidate {
  /** MusicBrainz release id (Cover Art Archive's key). */
  id: string
  /** Its release group, whose front cover stands in when the release has none. */
  group: string | null
  title: string
  artist: string
  date: string | null
  trackCount: number | null
  /** MusicBrainz's search score, 0 to 100. */
  score: number
}

const BASE = 'https://musicbrainz.org/ws/2'
const TIMEOUT_MS = 15_000
const INTERVAL_MS = 1_100
let last = 0

/** Waits so that requests leave at most once a second. */
async function paced(now: () => number = Date.now): Promise<void> {
  const wait = last + INTERVAL_MS - now()
  if (wait > 0) await new Promise((done) => setTimeout(done, wait))
  last = now()
}

/** A Lucene phrase: quotes and backslashes escaped. */
export const phrase = (value: string): string => `"${value.replace(/[\\"]/g, (match) => `\\${match}`)}"`

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

function candidate(value: unknown): ReleaseCandidate | null {
  if (!value || typeof value !== 'object') return null
  const release = value as Record<string, unknown>
  const id = text(release.id)
  const title = text(release.title)
  if (!id || !title) return null
  const credits = Array.isArray(release['artist-credit']) ? (release['artist-credit'] as Record<string, unknown>[]) : []
  const artist = credits.map((credit) => `${text(credit.name) ?? ''}${text(credit.joinphrase) ?? ''}`).join('')
  const group = release['release-group'] as Record<string, unknown> | undefined
  return {
    id,
    group: text(group?.id),
    title,
    artist,
    date: text(release.date),
    trackCount: typeof release['track-count'] === 'number' ? release['track-count'] : null,
    score: typeof release.score === 'number' ? release.score : 0,
  }
}

/** Releases matching the album's title and artist, best first. Throws when MusicBrainz cannot answer. */
export async function findReleases(
  album: string,
  artist: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ReleaseCandidate[]> {
  await paced()
  const params = new URLSearchParams({
    query: `release:${phrase(album)} AND artist:${phrase(artist)}`,
    fmt: 'json',
    limit: '10',
  })
  const response = await fetchImpl(`${BASE}/release/?${params.toString()}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    credentials: 'omit',
  })
  if (!response.ok) throw new Error(`MusicBrainz answered ${String(response.status)}`)
  const body = (await response.json()) as { releases?: unknown }
  const releases = Array.isArray(body.releases) ? body.releases : []
  return releases.map(candidate).filter((found) => found !== null)
}

/** A MusicBrainz artist and where its photo may be found. */
export interface ArtistLinks {
  id: string
  name: string
  /** A Wikimedia Commons file linked as the artist's image ("File:…" without the prefix). */
  commonsFile: string | null
  /** The artist's Wikidata item ("Q…"). */
  wikidata: string | null
}

const COMMONS_FILE = /^https?:\/\/commons\.wikimedia\.org\/wiki\/File:(.+)$/
const WIKIDATA_ITEM = /^https?:\/\/www\.wikidata\.org\/wiki\/(Q\d+)$/

async function getJson(path: string, params: Record<string, string>, fetchImpl: typeof fetch): Promise<unknown> {
  await paced()
  const response = await fetchImpl(`${BASE}${path}?${new URLSearchParams(params).toString()}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    credentials: 'omit',
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`MusicBrainz answered ${String(response.status)}`)
  return response.json()
}

/**
 * The artist of exactly this name that MusicBrainz scores best (at least 90),
 * with its image and Wikidata links; null when none matches. Two requests,
 * paced.
 */
export async function findArtist(name: string, fetchImpl: typeof fetch = fetch): Promise<ArtistLinks | null> {
  const found = (await getJson(
    '/artist/',
    { query: `artist:${phrase(name)}`, fmt: 'json', limit: '5' },
    fetchImpl,
  )) as {
    artists?: { id?: unknown; name?: unknown; score?: unknown }[]
  } | null
  const wanted = name.trim().toLowerCase()
  const best = (found?.artists ?? [])
    .filter((artist) => typeof artist.id === 'string' && typeof artist.name === 'string')
    .filter((artist) => (artist.name as string).trim().toLowerCase() === wanted && Number(artist.score) >= 90)
    .sort((a, b) => Number(b.score) - Number(a.score))[0]
  if (!best) return null
  const id = best.id as string
  const detail = (await getJson(`/artist/${encodeURIComponent(id)}`, { inc: 'url-rels', fmt: 'json' }, fetchImpl)) as {
    relations?: { type?: unknown; url?: { resource?: unknown } }[]
  } | null
  const link = (type: string, pattern: RegExp) => {
    for (const relation of detail?.relations ?? []) {
      const resource = relation.url?.resource
      const match = relation.type === type && typeof resource === 'string' ? pattern.exec(resource) : null
      if (match?.[1]) return decodeURIComponent(match[1])
    }
    return null
  }
  return {
    id,
    name: best.name as string,
    commonsFile: link('image', COMMONS_FILE),
    wikidata: link('wikidata', WIKIDATA_ITEM),
  }
}

/** For tests: forget the last request time. */
export function resetPacing(): void {
  last = 0
}
