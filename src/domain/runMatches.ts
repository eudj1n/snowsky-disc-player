/**
 * What the library enrichment's automatic mode takes without asking (owner,
 * 2026-10-02): an artist named exactly so, scored 100, and the only one of
 * that name; an edition scored 95 or more with the album's number of tracks.
 * Anything else waits for the owner.
 */

/** The one candidate named exactly so and scored 100, else null (none, or several of the name). */
export function sureArtist<T extends { score: number }>(
  candidates: readonly T[],
  exactly: (candidate: T) => boolean,
): T | null {
  const named = candidates.filter(exactly)
  return named.length === 1 && named[0]?.score === 100 ? named[0] : null
}

/** The best-ranked edition when it is scored 95 or more and has the album's number of tracks, else null. */
export function sureEdition<T extends { score: number; trackCount: number | null }>(
  ranked: readonly T[],
  trackCount: number,
): T | null {
  const top = ranked[0]
  return top && top.score >= 95 && top.trackCount === trackCount ? top : null
}
