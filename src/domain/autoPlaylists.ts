/**
 * Automatic playlists (owner, 2026-09-30; service combined-009): M3U lists in
 * the card's visible `Playlists/` folder, which the player's own file browser
 * opens and plays without the page. The page recomputes them from the library
 * and the service's play history and writes a list only when its entries
 * change. Five kinds, 50 tracks each: an artist's most played (made from the
 * artist page), the most played overall, a daily mix, recently added and long
 * not played.
 *
 * An entry is a whole file on the card, so a CUE track (a part of an image)
 * cannot be one; disliked tracks stay out, and every file appears once.
 */
import { credits } from './artist'
import { mostPlayed, type PlayRecord, type ServicePlay } from './history'
import { recentlyAdded, type LibraryTrack } from './track'

export type AutoKind = 'most_played' | 'artist_most_played' | 'recently_added' | 'not_played_lately' | 'daily_mix'

/** How long a list stays as written before it is drawn again (owner, 2026-09-30). */
export type RotationPeriod = 'day' | 'week' | 'month'
export const PERIODS: readonly RotationPeriod[] = ['day', 'week', 'month']

/** A record of the store's `auto_playlists` collection: which lists are the page's to rewrite. */
export interface AutoPlaylist {
  /** The list's name, fixed when it is made (its file is `<name>.m3u`). */
  name: string
  kind: AutoKind
  artist?: string
  /** The browser's local day the list was last written ('2026-09-30'). */
  written?: string
  /** A day when absent. */
  period?: RotationPeriod
  at: number
}

export const AUTO_KINDS: readonly AutoKind[] = [
  'most_played',
  'artist_most_played',
  'recently_added',
  'not_played_lately',
  'daily_mix',
]
/** The lists that are not an artist's, offered on the Playlists page. */
export type GlobalKind = Exclude<AutoKind, 'artist_most_played'>
export const GLOBAL_KINDS: readonly GlobalKind[] = ['most_played', 'daily_mix', 'recently_added', 'not_played_lately']
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
  /** The favorites (stock's MY_LOVE), loved like the most played in the daily mix. */
  favorites?: readonly LibraryTrack[]
  /** The local date ('2026-09-30') the daily mix is drawn for. */
  day?: string
  /** The list's entries as last written: a new daily mix leaves them for last. */
  previous?: readonly string[]
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
    case 'daily_mix':
      return dailyMix(tracks, input)
  }
}

/** Loved: the most played this many deep, and the favorites. */
const LOVED_DEPTH = 100

/**
 * Half loved (played twice or more, and the favorites), half rarely or never heard
 * (played at most once), each drawn and then shuffled by the day, so the mix
 * stays the same all day and changes the next. A half short of tracks is
 * made up from the other.
 */
function dailyMix(tracks: readonly LibraryTrack[], input: AutoInput): string[] {
  const random = seeded(input.day ?? '')
  const byPath = new Map(tracks.flatMap((track) => (track.path ? [[track.path, track] as const] : [])))
  const counts = new Map(
    input.most.flatMap((record) => (record.title ? [] : [[record.path, record.playCount] as const])),
  )
  // Loved: played twice or more (the most played this many deep) and the favorites; fresh: at most once.
  const loved = new Set(
    mostPlayed(tracks, input.most, LOVED_DEPTH).flatMap((track) =>
      track.path && (counts.get(track.path) ?? 0) >= 2 ? [track.path] : [],
    ),
  )
  for (const track of input.favorites ?? []) if (track.path && byPath.has(track.path)) loved.add(track.path)
  const fresh = [...byPath.keys()].filter((path) => !loved.has(path) && (counts.get(path) ?? 0) <= 1)
  // The last mix's tracks go last, so a new one differs as far as the library allows.
  const before = new Set(input.previous ?? [])
  const later = (paths: string[]) => [
    ...paths.filter((path) => !before.has(path)),
    ...paths.filter((path) => before.has(path)),
  ]
  const lovedDrawn = later(shuffle([...loved], random))
  const freshDrawn = later(shuffle(fresh, random))
  const half = AUTO_SIZE / 2
  const takeLoved = Math.min(lovedDrawn.length, Math.max(half, AUTO_SIZE - freshDrawn.length))
  const takeFresh = Math.min(freshDrawn.length, AUTO_SIZE - takeLoved)
  return shuffle([...lovedDrawn.slice(0, takeLoved), ...freshDrawn.slice(0, takeFresh)], random)
}

/** A small seeded generator (mulberry32 over the FNV-1a hash of the seed): the same seed, the same draw. */
function seeded(seed: string): () => number {
  let state = 2166136261
  for (const byte of new TextEncoder().encode(seed)) state = Math.imul(state ^ byte, 16777619) >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const swap = result[i] as T
    result[i] = result[j] as T
    result[j] = swap
  }
  return result
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** The day a list written on `written` is drawn again: a day, a week or a calendar month later. */
export function dueDay(written: string, period: RotationPeriod): string {
  const [year = 1970, month = 1, day = 1] = written.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (period === 'day') date.setUTCDate(day + 1)
  else if (period === 'week') date.setUTCDate(day + 7)
  else {
    // The same day next month, or its last day (31 January → 28 or 29 February).
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    date.setUTCDate(1)
    date.setUTCMonth(month)
    date.setUTCDate(Math.min(day, last))
  }
  return date.toISOString().slice(0, 10)
}

/** Whether a list is drawn again today: never written (or written before the periods), or its period has passed. */
export function isDue(list: Pick<AutoPlaylist, 'written' | 'period'>, today: string): boolean {
  return !list.written || !DAY.test(list.written) || today >= dueDay(list.written, list.period ?? 'day')
}

/** The local date a daily mix is drawn for. */
export function localDay(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
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
  const kept = {
    ...(typeof v.written === 'string' && DAY.test(v.written) ? { written: v.written } : {}),
    ...(PERIODS.includes(v.period as RotationPeriod) ? { period: v.period as RotationPeriod } : {}),
  }
  if (v.kind === 'artist_most_played')
    return typeof v.artist === 'string' && v.artist
      ? { name: v.name, kind: 'artist_most_played', artist: v.artist, ...kept, at }
      : null
  return { name: v.name, kind: v.kind as AutoKind, ...kept, at }
}
