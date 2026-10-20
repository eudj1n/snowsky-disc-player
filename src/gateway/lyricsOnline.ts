/**
 * Lyrics from the outside sources the owner allowed, the best of what they
 * have (owner, 2026-10-20): lrc.red first, for its word timings, then
 * LRCLIB. Each source is asked once, in order, until one gives word
 * timings; among what they gave, the highest level wins, and a level below
 * the one wanted is not offered (a track with line timings of its own takes
 * word timings only). A source that could not be reached is named, so the
 * listener knows what was not asked.
 */
import { lyricsLevel, parseLyrics, type LyricsLevel } from '../domain/lyrics'
import { findLyrics, type LyricsQuery } from './lrclib'
import { fetchLrcRedLyrics, matchingHits, searchLrcRed } from './lrcred'

export type OnlineLyricsSource = 'lrcred' | 'lrclib'
/** The order sources are asked in: word timings first. */
export const ONLINE_LYRICS_SOURCES: readonly OnlineLyricsSource[] = ['lrcred', 'lrclib']

export interface OnlineLyrics {
  source: OnlineLyricsSource
  text: string
  level: LyricsLevel
}

export interface OnlineLookup {
  /** The best lyrics found at or above the level wanted, if any. */
  found: OnlineLyrics | null
  /** The best level any source had, below the one wanted, when nothing was found. */
  best: LyricsLevel | null
  /** LRCLIB says the track is instrumental. */
  instrumental: boolean
  /** The sources that could not be reached. */
  failed: OnlineLyricsSource[]
}

const RANK: Record<LyricsLevel, number> = { none: 0, line: 1, word: 2 }
/** How many matching hits lrc.red is asked for, looking for the level wanted. */
const LRCRED_CANDIDATES = 3

const levelOf = (text: string): LyricsLevel => lyricsLevel(parseLyrics(text))

async function fromLrcRed(
  query: LyricsQuery,
  want: LyricsLevel,
  fetchImpl: typeof fetch,
): Promise<OnlineLyrics | null> {
  const hits = matchingHits(await searchLrcRed(`${query.artist} ${query.title}`, fetchImpl), query)
  let best: OnlineLyrics | null = null
  for (const hit of hits.slice(0, LRCRED_CANDIDATES)) {
    const text = await fetchLrcRedLyrics(hit.isrc, fetchImpl)
    if (!text || !parseLyrics(text).lines.length) continue
    const found: OnlineLyrics = { source: 'lrcred', text, level: levelOf(text) }
    if (!best || RANK[found.level] > RANK[best.level]) best = found
    if (RANK[best.level] >= RANK[want] && best.level === 'word') break
    if (RANK[best.level] >= RANK[want] && want !== 'none') break
  }
  return best
}

async function fromLrclib(
  query: LyricsQuery,
  fetchImpl: typeof fetch,
): Promise<{ lyrics: OnlineLyrics | null; instrumental: boolean }> {
  const result = await findLyrics(query, fetchImpl)
  const text = result?.synced ?? result?.plain ?? null
  return {
    lyrics: text ? { source: 'lrclib', text, level: levelOf(text) } : null,
    instrumental: result?.instrumental === true,
  }
}

/** Asks the sources in order for the track, wanting at least `want`. */
export async function findLyricsOnline(
  query: LyricsQuery,
  sources: readonly OnlineLyricsSource[],
  want: LyricsLevel,
  fetchImpl: typeof fetch = fetch,
): Promise<OnlineLookup> {
  let best: OnlineLyrics | null = null
  let instrumental = false
  const failed: OnlineLyricsSource[] = []
  for (const source of ONLINE_LYRICS_SOURCES) {
    if (!sources.includes(source)) continue
    try {
      let lyrics: OnlineLyrics | null
      if (source === 'lrcred') lyrics = await fromLrcRed(query, want, fetchImpl)
      else {
        const answer = await fromLrclib(query, fetchImpl)
        lyrics = answer.lyrics
        instrumental ||= answer.instrumental
      }
      if (lyrics && (!best || RANK[lyrics.level] > RANK[best.level])) best = lyrics
      if (best?.level === 'word') break
    } catch {
      failed.push(source)
    }
  }
  if (best && RANK[best.level] >= RANK[want]) return { found: best, best: null, instrumental, failed }
  return { found: null, best: best?.level ?? null, instrumental, failed }
}
