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
import { creditArtists, credits } from './artist'
import { mostPlayed, type PlayRecord, type ServicePlay } from './history'
import { recentlyAdded, type LibraryTrack } from './track'

export type AutoKind =
  'most_played' | 'artist_most_played' | 'recently_added' | 'not_played_lately' | 'daily_mix' | 'my_wave'

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
  'my_wave',
]
/** The lists that are not an artist's, offered on the Playlists page. */
export type GlobalKind = Exclude<AutoKind, 'artist_most_played'>
export const GLOBAL_KINDS: readonly GlobalKind[] = [
  'most_played',
  'daily_mix',
  'my_wave',
  'recently_added',
  'not_played_lately',
]
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
  /** What the outside sources say, for My wave; absent, the wave is drawn from the history alone. */
  wave?: WaveInput
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
    case 'my_wave':
      return myWave(tracks, input)
  }
}

/* My wave (owner, 2026-10-23; docs/recommendations.md). */

/** What ListenBrainz says, laid against the card, as the wave takes it. */
export interface WaveInput {
  /** The similar artists on the card of an artist on the card (by name), with ListenBrainz's scores. */
  similarArtists: ReadonlyMap<string, readonly { name: string; score: number }[]>
  /** The listeners' genres of an artist on the card (by name). */
  genres: ReadonlyMap<string, readonly string[]>
  /** The similar tracks on the card of a track on the card (by path), with ListenBrainz's scores. */
  similarTracks: ReadonlyMap<string, readonly { path: string; score: number }[]>
}
/** The newest plays the wave starts from. */
export const WAVE_RECENT = 30
/** Favorites drawn among the seeds. */
const WAVE_FAVORITES = 20
/** The same artist not within this many tracks. */
const WAVE_SPACING = 3

/**
 * The seeds of the wave: the tracks of the newest plays (each once) and some favorites, drawn by the day.
 * The sources are asked about these, so the wave's neighbourhood is theirs.
 */
export function waveSeeds(
  tracks: readonly LibraryTrack[],
  plays: readonly ServicePlay[],
  favorites: readonly LibraryTrack[],
  day = '',
): LibraryTrack[] {
  const byPath = new Map(tracks.flatMap((track) => (track.path ? [[track.path, track] as const] : [])))
  const seeds: LibraryTrack[] = []
  const seen = new Set<string>()
  for (let index = plays.length - 1; index >= 0 && seen.size < WAVE_RECENT; index--) {
    const path = plays[index]?.path
    const track = path ? byPath.get(path) : undefined
    if (!path || !track || seen.has(path)) continue
    seen.add(path)
    seeds.push(track)
  }
  for (const track of shuffle(
    favorites.filter((track) => track.path && byPath.has(track.path) && !seen.has(track.path)),
    seeded(`favorites:${day}`),
  ).slice(0, WAVE_FAVORITES)) {
    if (track.path) seen.add(track.path)
    seeds.push(track)
  }
  return seeds
}

/**
 * The wave: the neighbours of what was played lately and of some favorites, by ListenBrainz's similarity
 * (tracks, then artists), the listeners' genres and the files' own, with what was not played lately and a
 * little of the newest; the newest plays themselves and disliked tracks out; the same artist not within a
 * few tracks. Drawn by the day, so it stays the same all day and changes the next.
 */
function myWave(tracks: readonly LibraryTrack[], input: AutoInput): string[] {
  const random = seeded(`wave:${input.day ?? ''}`)
  const seeds = waveSeeds(tracks, input.plays, input.favorites ?? [], input.day)
  if (!seeds.length) return []
  const wave = input.wave
  const recent = new Set(seeds.flatMap((track) => (track.path ? [track.path] : [])))
  const seedArtists = new Map<string, number>()
  for (const seed of seeds)
    for (const name of creditArtists(seed.artist ?? '')) seedArtists.set(name, (seedArtists.get(name) ?? 0) + 1)
  const seedGenres = new Set(seeds.flatMap((seed) => (seed.genre ? [seed.genre.toLowerCase()] : [])))
  const seedTags = new Set<string>()
  for (const name of seedArtists.keys()) for (const tag of wave?.genres.get(name) ?? []) seedTags.add(tag.toLowerCase())
  // The similar artists of the seeds' artists, by their best score, normalised within each list.
  const nearArtists = new Map<string, number>()
  for (const name of seedArtists.keys()) {
    const similar = wave?.similarArtists.get(name) ?? []
    const top = similar[0]?.score ?? 0
    for (const other of similar)
      if (top > 0) nearArtists.set(other.name, Math.max(nearArtists.get(other.name) ?? 0, other.score / top))
  }
  // The similar tracks of the seeds, by their best score, normalised within each list.
  const nearTracks = new Map<string, number>()
  for (const seed of seeds) {
    const similar = seed.path ? (wave?.similarTracks.get(seed.path) ?? []) : []
    const top = similar[0]?.score ?? 0
    for (const other of similar)
      if (top > 0) nearTracks.set(other.path, Math.max(nearTracks.get(other.path) ?? 0, other.score / top))
  }
  const lately = new Set(input.plays.slice(-RECENT_PLAYS).map((play) => play.path))
  const played = new Set(input.plays.map((play) => play.path))
  const newest = new Set(
    recentlyAdded(
      tracks.filter((track) => track.addedAt !== null),
      AUTO_SIZE,
    ).map((track) => track.path),
  )
  const scored = tracks.flatMap((track) => {
    const path = track.path
    if (!path || recent.has(path)) return []
    const names = creditArtists(track.artist ?? '')
    let score = 0
    score += 4 * (nearTracks.get(path) ?? 0)
    score += 3 * Math.max(0, ...names.map((name) => nearArtists.get(name) ?? 0))
    if (names.some((name) => seedArtists.has(name))) score += 1
    const tags = names.flatMap((name) => wave?.genres.get(name) ?? []).map((tag) => tag.toLowerCase())
    if (tags.length && seedTags.size) score += (2 * tags.filter((tag) => seedTags.has(tag)).length) / tags.length
    else if (track.genre && seedGenres.has(track.genre.toLowerCase())) score += 1
    if (score === 0) return []
    if (!lately.has(path)) score += 1
    if (!played.has(path)) score += 0.5
    if (newest.has(path)) score += 0.5
    score += random()
    return [{ track, score }]
  })
  scored.sort((a, b) => b.score - a.score)
  // The same artist not within a few tracks: the best that keeps its distance, else the best there is.
  const chosen: LibraryTrack[] = []
  const pool = [...scored]
  while (chosen.length < AUTO_SIZE && pool.length) {
    const last = chosen.slice(-WAVE_SPACING).flatMap((track) => creditArtists(track.artist ?? ''))
    let index = pool.findIndex((item) => !creditArtists(item.track.artist ?? '').some((name) => last.includes(name)))
    if (index < 0) index = 0
    const [next] = pool.splice(index, 1)
    if (next) chosen.push(next.track)
  }
  return chosen.flatMap((track) => (track.path ? [track.path] : []))
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
