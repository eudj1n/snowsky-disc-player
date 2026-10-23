/**
 * ListenBrainz (owner, 2026-10-23; the analysis in docs/recommendations.md):
 * similarity and popularity by MusicBrainz id, read without a key or an
 * account once the owner allowed the source. Only ids go out. The Labs
 * service answers similar artists; the main API answers an artist's most
 * listened recordings and release groups, with `X-RateLimit-*` headers (30
 * requests a window): one request at a time, and a 429 waits out the
 * window it names before the next. Answers are trimmed to what the page
 * shows (the full ones run to a megabyte for a well-known artist).
 */
import type { PopularGroup, PopularRecording, SimilarArtist } from '../domain/recommendations'

const API = 'https://api.listenbrainz.org/1'
const LABS = 'https://labs.api.listenbrainz.org'
const TIMEOUT_MS = 20_000
/** The Labs algorithm the ListenBrainz site itself uses for similar artists (2026-10-23). */
const SIMILAR_ARTISTS_ALGORITHM =
  'session_based_days_7500_session_300_contribution_5_threshold_10_limit_100_filter_True_skip_30'
export const LISTENBRAINZ_SITE = 'https://listenbrainz.org'
/** How many of each the page keeps. */
export const SIMILAR_ARTISTS_KEPT = 40
export const POPULAR_RECORDINGS_KEPT = 200
export const POPULAR_GROUPS_KEPT = 60
export type { PopularGroup, PopularRecording, SimilarArtist }

const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)
const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0)
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null

/* One request at a time, each after the window a 429 named. */
let chain: Promise<unknown> = Promise.resolve()
let resumeAt = 0
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))
async function read(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const task = chain.then(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const wait = resumeAt - Date.now()
      if (wait > 0) await sleep(wait)
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), credentials: 'omit' })
      if (response.status === 429) {
        const seconds = Number(response.headers.get('X-RateLimit-Reset-In'))
        resumeAt = Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 10_000)
        continue
      }
      if (response.status === 404) return []
      if (!response.ok) throw new Error(`ListenBrainz answered ${String(response.status)}`)
      return (await response.json()) as unknown
    }
    throw new Error('ListenBrainz is rate limited')
  })
  chain = task.catch(() => undefined)
  return task
}
/** Forgets the pacing (tests). */
export function resetListenBrainzPacing(): void {
  chain = Promise.resolve()
  resumeAt = 0
}

/** Artists ListenBrainz's listeners play in the same sessions, the closest first. Throws when it cannot answer. */
export async function similarArtists(mbid: string, fetchImpl: typeof fetch = fetch): Promise<SimilarArtist[]> {
  const query = new URLSearchParams({ artist_mbids: mbid, algorithm: SIMILAR_ARTISTS_ALGORITHM })
  const body = await read(`${LABS}/similar-artists/json?${query}`, fetchImpl)
  if (!Array.isArray(body)) return []
  const found: SimilarArtist[] = []
  for (const item of body) {
    const row = record(item)
    const id = text(row?.artist_mbid)
    const name = text(row?.name)
    if (!row || !id || !MBID.test(id) || !name || id === mbid) continue
    found.push({ mbid: id, name, comment: text(row.comment), score: count(row.score) })
  }
  return found.sort((a, b) => b.score - a.score).slice(0, SIMILAR_ARTISTS_KEPT)
}

/** The artist's recordings by ListenBrainz's listen counts, the most listened first. */
export async function popularRecordings(mbid: string, fetchImpl: typeof fetch = fetch): Promise<PopularRecording[]> {
  const body = await read(`${API}/popularity/top-recordings-for-artist/${encodeURIComponent(mbid)}`, fetchImpl)
  if (!Array.isArray(body)) return []
  const found: PopularRecording[] = []
  for (const item of body) {
    const row = record(item)
    const id = text(row?.recording_mbid)
    const name = text(row?.recording_name)
    if (!row || !id || !name) continue
    found.push({ mbid: id, name, listens: count(row.total_listen_count), listeners: count(row.total_user_count) })
  }
  return found.sort((a, b) => b.listens - a.listens).slice(0, POPULAR_RECORDINGS_KEPT)
}

/** The artist's release groups by ListenBrainz's listen counts, the most listened first. */
export async function popularGroups(mbid: string, fetchImpl: typeof fetch = fetch): Promise<PopularGroup[]> {
  const body = await read(`${API}/popularity/top-release-groups-for-artist/${encodeURIComponent(mbid)}`, fetchImpl)
  if (!Array.isArray(body)) return []
  const found: PopularGroup[] = []
  for (const item of body) {
    const row = record(item)
    const group = record(row?.release_group)
    const id = text(row?.release_group_mbid)
    const name = text(group?.name)
    if (!row || !id || !name) continue
    found.push({
      mbid: id,
      name,
      date: text(group?.date),
      type: text(group?.type),
      listens: count(row.total_listen_count),
      listeners: count(row.total_user_count),
    })
  }
  return found.sort((a, b) => b.listens - a.listens).slice(0, POPULAR_GROUPS_KEPT)
}
