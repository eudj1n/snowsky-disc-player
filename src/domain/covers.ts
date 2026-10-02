/**
 * Choosing a found cover's release and where it may go on the card (owner,
 * 2026-09-29, enrichment step 2). A release is taken only when MusicBrainz
 * scores it well, preferring one with the album's number of tracks. A cover
 * goes into the album's folder as `cover.jpg` (or `.png`), which the media
 * route reads for every track there, so only where that folder holds this
 * album alone; nothing on the card is overwritten.
 */
import { CARD_ROOT } from './imports'

/** The fewest points a MusicBrainz match needs to be offered. */
export const MIN_SCORE = 85

export function pickRelease<T extends { score: number; trackCount: number | null }>(
  candidates: readonly T[],
  trackCount: number | null,
): T | null {
  const best = (list: readonly T[]) => [...list].sort((a, b) => b.score - a.score)[0] ?? null
  const good = candidates.filter((candidate) => candidate.score >= MIN_SCORE)
  const sameLength = trackCount === null ? [] : good.filter((candidate) => candidate.trackCount === trackCount)
  return best(sameLength) ?? best(good)
}

/**
 * The editions worth offering for the listener's choice (owner, 2026-10-01):
 * well scored, those with the album's number of tracks first, then by score;
 * at most twelve.
 */
export function rankReleases<T extends { score: number; trackCount: number | null }>(
  candidates: readonly T[],
  trackCount: number | null,
): T[] {
  const same = (candidate: T) => Number(trackCount !== null && candidate.trackCount === trackCount)
  return candidates
    .filter((candidate) => candidate.score >= MIN_SCORE)
    .sort((a, b) => same(b) - same(a) || b.score - a.score)
    .slice(0, 12)
}

/**
 * An album title without the edition its tags add in brackets at the end
 * ("Born This Way (International Special Edition Version)", "Title (Deluxe)
 * [Remastered]"), which MusicBrainz keeps out of the release's title; null when
 * there is none to drop (owner, 2026-10-02).
 */
export function titleWithoutEdition(title: string): string | null {
  const whole = title.trim()
  let bare = whole
  for (;;) {
    const next = bare.replace(/\s*(\([^()]*\)|\[[^[\]]*\])$/, '').trim()
    if (next === bare || !next) break
    bare = next
  }
  return bare === whole ? null : bare
}

/**
 * The folder covers the service's media route reads, in its order (device
 * media.c; FAT ignores case, so the order is by name and type).
 */
const FOLDER_COVERS = [
  'cover.jpg',
  'folder.jpg',
  'front.jpg',
  'cover.jpeg',
  'folder.jpeg',
  'cover.png',
  'folder.png',
  'front.png',
]

/** The folder's file the media route shows as the cover, by its own spelling; null when none is there. */
export function folderCoverName(names: readonly string[]): string | null {
  for (const wanted of FOLDER_COVERS) {
    const found = names.find((name) => name.toLowerCase() === wanted)
    if (found) return found
  }
  return null
}

export type CoverPlace = { folder: string } | { refused: 'folders' | 'shared' | 'outside' }

const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/'))

/**
 * The card-relative folder a cover of these tracks may go to: the one folder
 * they share, when no track of another album lives there.
 */
export function coverPlace(
  albumTracks: readonly { path: string | null; album: string | null }[],
  allTracks: readonly { path: string | null; album: string | null }[],
): CoverPlace {
  const folders = new Set(albumTracks.flatMap((track) => (track.path ? [folderOf(track.path)] : [])))
  const [folder] = [...folders]
  if (folders.size !== 1 || folder === undefined) return { refused: 'folders' }
  if (!(folder + '/').startsWith(CARD_ROOT) || folder + '/' === CARD_ROOT) return { refused: 'outside' }
  const titles = new Set(albumTracks.map((track) => track.album))
  const shared = allTracks.some((track) => track.path && folderOf(track.path) === folder && !titles.has(track.album))
  return shared ? { refused: 'shared' } : { folder: folder.slice(CARD_ROOT.length) }
}
