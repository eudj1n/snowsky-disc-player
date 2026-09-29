/**
 * LRCLIB (https://lrclib.net), the free lyrics database the release's reviewed
 * origins admit (owner, 2026-09-29, enrichment step 1). An exact lookup by
 * artist, title, album and duration (LRCLIB matches within two seconds), else
 * a search by artist and title that keeps a result within three seconds of
 * the track. No key, no cookies and no custom header, so the browser sends a
 * simple GET without a CORS preflight. Only what the listener asked for
 * leaves the network: the track's names and length.
 */

export interface FoundLyrics {
  /** LRC text with line (and possibly word) timings, when LRCLIB has it. */
  synced: string | null
  plain: string | null
  instrumental: boolean
}

export interface LyricsQuery {
  artist: string
  title: string
  album: string | null
  durationMs: number | null
}

const BASE = 'https://lrclib.net/api'
const TIMEOUT_MS = 10_000
/** How far a search result's length may be from the track's. */
const SEARCH_SLACK_S = 3

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null)

function record(value: unknown): (FoundLyrics & { duration: number | null }) | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  const found = {
    synced: text(item.syncedLyrics),
    plain: text(item.plainLyrics),
    instrumental: item.instrumental === true,
    duration: typeof item.duration === 'number' ? item.duration : null,
  }
  return found.synced || found.plain || found.instrumental ? found : null
}

async function getJson(fetchImpl: typeof fetch, path: string, params: Record<string, string>): Promise<unknown> {
  const url = `${BASE}${path}?${new URLSearchParams(params).toString()}`
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), credentials: 'omit' })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`LRCLIB answered ${String(response.status)}`)
  return response.json()
}

/** The track's lyrics on LRCLIB, or null when it has none. Throws when LRCLIB cannot be reached. */
export async function findLyrics(query: LyricsQuery, fetchImpl: typeof fetch = fetch): Promise<FoundLyrics | null> {
  const seconds = query.durationMs ? Math.round(query.durationMs / 1000) : null
  const strip = (found: ReturnType<typeof record>): FoundLyrics | null =>
    found ? { synced: found.synced, plain: found.plain, instrumental: found.instrumental } : null
  if (query.album && seconds) {
    const exact = record(
      await getJson(fetchImpl, '/get', {
        artist_name: query.artist,
        track_name: query.title,
        album_name: query.album,
        duration: String(seconds),
      }),
    )
    if (exact) return strip(exact)
  }
  const results = await getJson(fetchImpl, '/search', { artist_name: query.artist, track_name: query.title })
  if (!Array.isArray(results)) return null
  const candidates = results
    .map(record)
    .filter((found) => found !== null)
    .filter(
      (found) => seconds === null || found.duration === null || Math.abs(found.duration - seconds) <= SEARCH_SLACK_S,
    )
  // Synced lyrics first, then plain, then an instrumental mark.
  const best =
    candidates.find((found) => found.synced) ?? candidates.find((found) => found.plain) ?? candidates[0] ?? null
  return strip(best)
}
