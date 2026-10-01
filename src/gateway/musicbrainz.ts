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
  /** What tells editions apart (owner, 2026-10-01: the listener chooses among them). */
  country: string | null
  /** Its media's formats, as "CD" or "2×Vinyl". */
  format: string | null
  label: string | null
  catalogNumber: string | null
  barcode: string | null
  /** The release group's primary type: Album, EP, Single… */
  type: string | null
  /** The first credited artist's MusicBrainz id (fanart.tv's key for album covers). */
  artistId: string | null
}

/** Its media's formats in order, counted: "CD", "2×CD", "CD + DVD". */
function formats(media: unknown): string | null {
  if (!Array.isArray(media)) return null
  const counted = new Map<string, number>()
  for (const medium of media as Record<string, unknown>[]) {
    const format = text(medium.format)
    if (format) counted.set(format, (counted.get(format) ?? 0) + 1)
  }
  return [...counted].map(([format, count]) => (count > 1 ? `${String(count)}×${format}` : format)).join(' + ') || null
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
  const labels = Array.isArray(release['label-info']) ? (release['label-info'] as Record<string, unknown>[]) : []
  const label = labels[0]
  const firstArtist = credits[0]?.artist as Record<string, unknown> | undefined
  return {
    id,
    group: text(group?.id),
    title,
    artist,
    date: text(release.date),
    trackCount: typeof release['track-count'] === 'number' ? release['track-count'] : null,
    score: typeof release.score === 'number' ? release.score : 0,
    country: text(release.country),
    format: formats(release.media),
    label: text((label?.label as Record<string, unknown> | undefined)?.name),
    catalogNumber: text(label?.['catalog-number']),
    barcode: text(release.barcode),
    type: text(group?.['primary-type']),
    artistId: text(firstArtist?.id),
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

/**
 * An artist MusicBrainz offers for a name, with what tells namesakes apart
 * (owner, 2026-10-01: the listener confirms which one is meant, and its id
 * and these facts are kept on the player). MusicBrainz core data is CC0.
 */
export interface ArtistCandidate {
  id: string
  name: string
  sortName: string | null
  /** Person, Group, Orchestra, Choir, Character or Other. */
  type: string | null
  /** ISO 3166 code, else the area's name. */
  country: string | null
  begin: string | null
  end: string | null
  disambiguation: string | null
  aliases: string[]
  score: number
}

function artistCandidate(value: unknown): ArtistCandidate | null {
  if (!value || typeof value !== 'object') return null
  const artist = value as Record<string, unknown>
  const id = text(artist.id)
  const name = text(artist.name)
  if (!id || !name) return null
  const span = (artist['life-span'] ?? {}) as Record<string, unknown>
  const area = (artist.area ?? {}) as Record<string, unknown>
  const aliases = Array.isArray(artist.aliases) ? (artist.aliases as Record<string, unknown>[]) : []
  return {
    id,
    name,
    sortName: text(artist['sort-name']),
    type: text(artist.type),
    country: text(artist.country) ?? text(area.name),
    begin: text(span.begin),
    end: text(span.end),
    disambiguation: text(artist.disambiguation),
    aliases: [...new Set(aliases.map((alias) => text(alias.name)).filter((alias) => alias !== null))],
    score: typeof artist.score === 'number' ? artist.score : 0,
  }
}

const folded = (value: string): string => value.trim().toLocaleLowerCase()
/** The candidate carries exactly this name, as its own or as an alias. */
export const namedExactly = (candidate: ArtistCandidate, name: string): boolean =>
  [candidate.name, ...candidate.aliases].some((known) => folded(known) === folded(name))

/**
 * Artists named so, as their name or an alias (another script, a former
 * spelling): those carrying the name exactly first, then by score. Throws
 * when MusicBrainz cannot answer.
 */
export async function searchArtists(name: string, fetchImpl: typeof fetch = fetch): Promise<ArtistCandidate[]> {
  const found = (await getJson(
    '/artist/',
    { query: `artist:${phrase(name)} OR alias:${phrase(name)}`, fmt: 'json', limit: '8' },
    fetchImpl,
  )) as { artists?: unknown } | null
  const artists = Array.isArray(found?.artists) ? found.artists : []
  return artists
    .map(artistCandidate)
    .filter((artist) => artist !== null)
    .sort((a, b) => Number(namedExactly(b, name)) - Number(namedExactly(a, name)) || b.score - a.score)
}

/** The artist to take without asking: named exactly so and scored at least 90. */
export const bestArtist = (candidates: readonly ArtistCandidate[], name: string): ArtistCandidate | null =>
  candidates.find((candidate) => namedExactly(candidate, name) && candidate.score >= 90) ?? null

/** Where an artist's pictures and pages are, by its MusicBrainz links. */
export interface ArtistLinks {
  /** A Wikimedia Commons file linked as the artist's image ("File:…" without the prefix). */
  commonsFile: string | null
  /** The artist's Wikidata item ("Q…"). */
  wikidata: string | null
  official: string | null
  bandcamp: string | null
  discogs: string | null
}

const COMMONS_FILE = /^https?:\/\/commons\.wikimedia\.org\/wiki\/File:(.+)$/
const WIKIDATA_ITEM = /^https?:\/\/www\.wikidata\.org\/wiki\/(Q\d+)$/
const PAGE = /^https?:\/\/\S+$/

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

/** The artist's links (one request, paced); null when MusicBrainz no longer knows the id. */
export async function artistLinks(id: string, fetchImpl: typeof fetch = fetch): Promise<ArtistLinks | null> {
  const detail = (await getJson(`/artist/${encodeURIComponent(id)}`, { inc: 'url-rels', fmt: 'json' }, fetchImpl)) as {
    relations?: { type?: unknown; url?: { resource?: unknown } }[]
  } | null
  if (!detail) return null
  const link = (type: string, pattern: RegExp, whole = false) => {
    for (const relation of detail.relations ?? []) {
      const resource = relation.url?.resource
      const match = relation.type === type && typeof resource === 'string' ? pattern.exec(resource) : null
      if (match) return whole ? match[0] : match[1] ? decodeURIComponent(match[1]) : null
    }
    return null
  }
  return {
    commonsFile: link('image', COMMONS_FILE),
    wikidata: link('wikidata', WIKIDATA_ITEM),
    official: link('official homepage', PAGE, true),
    bandcamp: link('bandcamp', PAGE, true),
    discogs: link('discogs', PAGE, true),
  }
}

/** The artist MusicBrainz takes for the name without asking, with its links; null when none matches. */
export async function findArtist(
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<(ArtistLinks & { id: string; name: string }) | null> {
  const best = bestArtist(await searchArtists(name, fetchImpl), name)
  const links = best ? await artistLinks(best.id, fetchImpl) : null
  return best && links ? { id: best.id, name: best.name, ...links } : null
}

/** For tests: forget the last request time. */
export function resetPacing(): void {
  last = 0
}
