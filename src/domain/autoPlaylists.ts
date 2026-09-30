/**
 * Automatic playlists (owner, 2026-09-30; service combined-009): M3U lists in
 * the card's visible `Playlists/` folder, which the player's own file browser
 * opens and plays without the page. The page recomputes them from the library
 * and the service's play history and writes a list only when its entries
 * change. Four kinds, 50 tracks each: an artist's most played (made from the
 * artist page), the most played overall, recently added and long not played.
 *
 * An entry is a whole file on the card, so a CUE track (a part of an image)
 * cannot be one; disliked tracks stay out, and every file appears once.
 */
import { credits } from './artist'
import { mostPlayed, type PlayRecord, type ServicePlay } from './history'
import { recentlyAdded, type LibraryTrack } from './track'

export type AutoKind = 'most_played' | 'artist_most_played' | 'recently_added' | 'not_played_lately'

/** A record of the store's `auto_playlists` collection: which lists are the page's to rewrite. */
export interface AutoPlaylist {
  /** The list's name, fixed when it is made (its file is `<name>.m3u`). */
  name: string
  kind: AutoKind
  artist?: string
  at: number
}

export const AUTO_KINDS: readonly AutoKind[] = [
  'most_played',
  'artist_most_played',
  'recently_added',
  'not_played_lately',
]
/** The lists that are not an artist's, offered on the Playlists page. */
export type GlobalKind = Exclude<AutoKind, 'artist_most_played'>
export const GLOBAL_KINDS: readonly GlobalKind[] = ['most_played', 'recently_added', 'not_played_lately']
export const AUTO_SIZE = 50
/** Long not played: a track played at all, but not within the newest plays of the history. */
export const RECENT_PLAYS = 100

export interface AutoInput {
  tracks: readonly LibraryTrack[]
  /** Per-track play counts of the service's history. */
  most: readonly PlayRecord[]
  /** The service's plays, oldest first. */
  plays: readonly ServicePlay[]
  disliked: (track: LibraryTrack) => boolean
}

/** Tracks a list can hold: whole files, not disliked, each file once (the first track of a path). */
export function listable(tracks: readonly LibraryTrack[], disliked: (track: LibraryTrack) => boolean): LibraryTrack[] {
  const seen = new Set<string>()
  return tracks.filter((track) => {
    if (!track.path || track.cue || disliked(track) || seen.has(track.path)) return false
    seen.add(track.path)
    return true
  })
}

/** The files a list holds now, in play order. */
export function autoEntries(list: Pick<AutoPlaylist, 'kind' | 'artist'>, input: AutoInput): string[] {
  const tracks = listable(input.tracks, input.disliked)
  const paths = (chosen: readonly LibraryTrack[]) => chosen.flatMap((track) => (track.path ? [track.path] : []))
  switch (list.kind) {
    case 'most_played':
      return paths(mostPlayed(tracks, input.most, AUTO_SIZE))
    case 'artist_most_played': {
      const artist = list.artist
      if (!artist) return []
      return paths(
        mostPlayed(
          tracks.filter((track) => credits(track.artist, artist)),
          input.most,
          AUTO_SIZE,
        ),
      )
    }
    case 'recently_added':
      return paths(
        recentlyAdded(
          tracks.filter((track) => track.addedAt !== null),
          AUTO_SIZE,
        ),
      )
    case 'not_played_lately':
      return notPlayedLately(tracks, input.plays)
  }
}

/**
 * Tracks played before but not among the newest plays, the longest unplayed
 * first. The device clock may be wrong, so the history's order counts, not
 * its times. A CUE image's plays (by track title) count for no entry.
 */
function notPlayedLately(tracks: readonly LibraryTrack[], plays: readonly ServicePlay[]): string[] {
  const last = new Map<string, number>()
  plays.forEach((play, index) => {
    if (!play.title) last.set(play.path, index)
  })
  const recent = plays.length - RECENT_PLAYS
  const byPath = new Map(tracks.flatMap((track) => (track.path ? [[track.path, track] as const] : [])))
  return [...last.entries()]
    .filter(([path, index]) => index < recent && byPath.has(path))
    .sort((a, b) => a[1] - b[1])
    .slice(0, AUTO_SIZE)
    .map(([path]) => path)
}

const encoder = new TextEncoder()
/** The service's list names: at most 96 bytes, none of `/ \ : * ? " < > |` or controls, no dot or space at either end. */
export function listName(text: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is replaced
  let name = text.replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, '-').replace(/\s+/g, ' ')
  // Cut whole characters (graphemes) until the name fits.
  const parts = Array.from(new Intl.Segmenter().segment(name), (part) => part.segment)
  while (encoder.encode(parts.join('')).length > 96) parts.pop()
  name = parts.join('')
  return name.replace(/^[\s.]+|[\s.]+$/g, '')
}

export const sameEntries = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((entry, index) => entry === b[index])

/** A store record as the page reads it; anything else is not the page's list. */
export function autoPlaylist(value: unknown): AutoPlaylist | null {
  const v = value as Record<string, unknown> | null
  if (!v || typeof v.name !== 'string' || !AUTO_KINDS.includes(v.kind as AutoKind)) return null
  const at = typeof v.at === 'number' ? v.at : 0
  if (v.kind === 'artist_most_played')
    return typeof v.artist === 'string' && v.artist
      ? { name: v.name, kind: 'artist_most_played', artist: v.artist, at }
      : null
  return { name: v.name, kind: v.kind as AutoKind, at }
}
