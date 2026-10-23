/**
 * What ListenBrainz's similarity and popularity say about an artist, laid
 * against the card (owner, 2026-10-23; docs/recommendations.md): the similar
 * artists the card holds and those it lacks, the artist's tracks on the card
 * by the world's listen counts, and the albums the card lacks. Names are
 * compared loosely where no MusicBrainz id ties them.
 */
import type { Album } from './album'
import { foldName } from './fold'
import type { Track } from './track'

/** An artist ListenBrainz's listeners play in the same sessions as another. */
export interface SimilarArtist {
  mbid: string
  name: string
  /** Of the artist, for the namesakes ("UK rock band"). */
  comment: string | null
  score: number
}
/** A recording of an artist by ListenBrainz's listen counts. */
export interface PopularRecording {
  mbid: string
  name: string
  listens: number
  listeners: number
}
/** A release group of an artist by ListenBrainz's listen counts. */
export interface PopularGroup {
  mbid: string
  name: string
  date: string | null
  type: string | null
  listens: number
  listeners: number
}

export interface SimilarOnCard {
  /** The card's artist, by its name there. */
  name: string
  score: number
}
export interface SimilarArtists {
  onCard: SimilarOnCard[]
  absent: SimilarArtist[]
}

/**
 * The similar artists the card holds, in ListenBrainz's order, and the rest. An artist is on the card when
 * its id is confirmed for a name there, else when a name there reads the same.
 */
export function similarArtistsOnCard(
  similar: readonly SimilarArtist[],
  names: readonly string[],
  mbidOf: (name: string) => string | null,
): SimilarArtists {
  const byMbid = new Map<string, string>()
  const byFold = new Map<string, string>()
  for (const name of names) {
    const mbid = mbidOf(name)
    if (mbid) byMbid.set(mbid, name)
    if (!byFold.has(foldName(name))) byFold.set(foldName(name), name)
  }
  const onCard: SimilarOnCard[] = []
  const absent: SimilarArtist[] = []
  const seen = new Set<string>()
  for (const artist of similar) {
    const name = byMbid.get(artist.mbid) ?? byFold.get(foldName(artist.name)) ?? null
    if (name) {
      if (!seen.has(name)) onCard.push({ name, score: artist.score })
      seen.add(name)
    } else absent.push(artist)
  }
  return { onCard, absent }
}

export interface PopularTrack {
  track: Track
  listens: number
}

/** The artist's tracks on the card by the world's listen counts, each title once, the most listened first. */
export function popularTracksOnCard(
  recordings: readonly PopularRecording[],
  tracks: readonly Track[],
  limit: number,
): PopularTrack[] {
  const byTitle = new Map<string, Track>()
  for (const track of tracks) {
    const key = foldName(track.title)
    if (key && !byTitle.has(key)) byTitle.set(key, track)
  }
  const found: PopularTrack[] = []
  const taken = new Set<string>()
  for (const recording of recordings) {
    const key = foldName(recording.name)
    const track = byTitle.get(key)
    if (!track || taken.has(key)) continue
    taken.add(key)
    found.push({ track, listens: recording.listens })
    if (found.length >= limit) break
  }
  return found
}

/** Kinds of release group the card is told it lacks: albums and EPs, not singles or the rest. */
const WANTED_TYPES = new Set(['Album', 'EP'])

/**
 * The artist's release groups the card lacks, the most listened first: a group is on the card when its id is
 * an album's confirmed group, else when an album's title reads the same.
 */
export function groupsNotOnCard(
  groups: readonly PopularGroup[],
  albums: readonly Album[],
  groupOf: (album: Album) => string | null,
  limit: number,
): PopularGroup[] {
  const held = new Set<string>()
  const titles = new Set<string>()
  for (const album of albums) {
    const group = groupOf(album)
    if (group) held.add(group)
    titles.add(foldName(album.title))
  }
  const found: PopularGroup[] = []
  const seen = new Set<string>()
  for (const group of groups) {
    const key = foldName(group.name)
    if (!WANTED_TYPES.has(group.type ?? '') || held.has(group.mbid) || titles.has(key) || seen.has(key)) continue
    seen.add(key)
    found.push(group)
    if (found.length >= limit) break
  }
  return found
}
