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

/** What a release offers for ranking: MusicBrainz's score, its tracks, and the words naming its edition. */
interface Ranked {
  score: number
  trackCount: number | null
  title?: string
  disambiguation?: string | null
}

export function pickRelease<T extends Ranked>(
  candidates: readonly T[],
  trackCount: number | null,
  title?: string,
): T | null {
  return rankReleases(candidates, trackCount, title)[0] ?? null
}

/**
 * The editions worth offering for the listener's choice (owner, 2026-10-01):
 * well scored; those with the album's number of tracks first, then those that
 * share more of the words the album's title adds to its base (the edition it
 * names: "20th", "anniversary"), then by score; at most twelve.
 */
export function rankReleases<T extends Ranked>(
  candidates: readonly T[],
  trackCount: number | null,
  title?: string,
): T[] {
  const same = (candidate: T) => Number(trackCount !== null && candidate.trackCount === trackCount)
  const named = title ? editionWords(title) : []
  const shared = (candidate: T) => {
    if (!named.length) return 0
    const own = new Set(words(`${candidate.title ?? ''} ${candidate.disambiguation ?? ''}`))
    return named.filter((word) => own.has(word)).length
  }
  return candidates
    .filter((candidate) => candidate.score >= MIN_SCORE)
    .sort((a, b) => same(b) - same(a) || shared(b) - shared(a) || b.score - a.score)
    .slice(0, 12)
}

const words = (text: string): string[] => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []

/** The words a title adds to its base: the edition it names ("Fallen: 20th Anniversary Edition" adds three). */
export function editionWords(title: string): string[] {
  const base = new Set(words(titleVariants(title).at(-1) ?? title))
  return [...new Set(words(title))].filter((word) => !base.has(word))
}

/** Separators between an album's base title and the edition its tags add after it. */
const SUBTITLES = [': ', ' - ', ' – ', ' — ']

/**
 * The titles a MusicBrainz search asks for, in one request: the tag's whole
 * title, the title without its bracketed edition, and the base before a
 * subtitle separator, as MusicBrainz often keeps the edition apart from the
 * title ("Fallen: 20th Anniversary Edition" is "Fallen (20th anniversary)"
 * there; owner, 2026-10-02). The shortest comes last.
 */
export function titleVariants(title: string): string[] {
  const whole = title.trim()
  const bare = titleWithoutEdition(whole) ?? whole
  const variants = [whole, bare]
  const at = Math.min(...SUBTITLES.map((separator) => bare.indexOf(separator)).filter((index) => index > 0))
  if (Number.isFinite(at)) {
    const base = bare.slice(0, at).trim()
    if (base.length >= 2) variants.push(base)
  }
  return [...new Set(variants)]
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
