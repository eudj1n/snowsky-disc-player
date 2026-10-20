/**
 * lrc.red (https://lrc.red), the free lyrics service with word timings
 * (owner, 2026-10-20; docs/lrcred.md). No key, open CORS, plain GETs
 * without a preflight: a full-text search (`/search.json?q=`) answers hits
 * with the track's names, album and length, and a hit's `/s/<ISRC>.lrc`
 * is enhanced LRC (word stamps), plain LRC (line stamps) or plain text,
 * by what the service has. The search is full text, so the match by
 * artist, title and length is made here, as for LRCLIB's search; its
 * `POST …/sync` is never called. Only the track's artist and title leave
 * the network.
 */
import { foldName } from '../domain/fold'
import type { LyricsQuery } from './lrclib'

export interface LrcRedHit {
  isrc: string
  title: string
  artist: string
  album: string | null
  /** Seconds, when the service knows the length. */
  duration: number | null
}

const BASE = 'https://lrc.red'
const TIMEOUT_MS = 10_000
/** How far a hit's length may be from the track's. */
const SLACK_S = 3

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null)

function hit(value: unknown): LrcRedHit | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  const isrc = text(item.isrc)
  const title = text(item.title)
  const artist = text(item.artist)
  if (!isrc || !title || !artist || !/^[A-Za-z0-9]{12}$/.test(isrc)) return null
  return {
    isrc,
    title,
    artist,
    album: text(item.album),
    duration: typeof item.duration === 'number' && item.duration > 0 ? item.duration : null,
  }
}

async function get(fetchImpl: typeof fetch, path: string): Promise<Response> {
  return fetchImpl(`${BASE}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS), credentials: 'omit' })
}

/** The first page of hits for a full-text query. Throws when lrc.red cannot be reached. */
export async function searchLrcRed(query: string, fetchImpl: typeof fetch = fetch): Promise<LrcRedHit[]> {
  const response = await get(fetchImpl, `/search.json?${new URLSearchParams({ q: query }).toString()}`)
  if (!response.ok) throw new Error(`lrc.red answered ${String(response.status)}`)
  const body = (await response.json()) as { hits?: unknown }
  return Array.isArray(body.hits) ? body.hits.map(hit).filter((item) => item !== null) : []
}

/** A hit's LRC text, or null when lrc.red has none for it. Throws when it cannot be reached. */
export async function fetchLrcRedLyrics(isrc: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const response = await get(fetchImpl, `/s/${encodeURIComponent(isrc)}.lrc`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`lrc.red answered ${String(response.status)}`)
  return response.text()
}

/**
 * The hits that are the track, closest first: the same title, the artist
 * named (either way round: "Виктор Цой, Кино" names Кино), and a length
 * within three seconds when both are known; the track's album first, then
 * the nearest length.
 */
export function matchingHits(hits: readonly LrcRedHit[], query: LyricsQuery): LrcRedHit[] {
  const title = foldName(query.title)
  const artist = foldName(query.artist)
  const album = query.album ? foldName(query.album) : null
  const seconds = query.durationMs ? query.durationMs / 1000 : null
  if (!title || !artist) return []
  const gap = (item: LrcRedHit) =>
    seconds === null || item.duration === null ? SLACK_S : Math.abs(item.duration - seconds)
  return hits
    .filter((item) => {
      const name = foldName(item.artist)
      return (
        foldName(item.title) === title &&
        (name === artist || name.includes(artist) || artist.includes(name)) &&
        gap(item) <= SLACK_S
      )
    })
    .map((item) => ({ item, same: album !== null && item.album !== null && foldName(item.album) === album }))
    .sort((a, b) => Number(b.same) - Number(a.same) || gap(a.item) - gap(b.item))
    .map(({ item }) => item)
}
