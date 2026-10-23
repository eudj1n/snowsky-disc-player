/**
 * What ListenBrainz's similarity and popularity say about an artist, laid
 * against the card (owner, 2026-10-23; docs/recommendations.md): the similar
 * artists the card holds and those it lacks, the artist's tracks on the card
 * by the world's listen counts, and the albums the card lacks. Names are
 * compared loosely where no MusicBrainz id ties them.
 */
import { byTrackNumber, type Album } from './album'
import { creditArtists, creditLabel } from './artist'
import { foldName } from './fold'
import type { LibraryTrack, Track } from './track'

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

/** A recording ListenBrainz's listeners play in the same sessions as another. */
export interface SimilarRecording {
  mbid: string
  name: string
  /** The credit as ListenBrainz spells it ("A & B"). */
  artist: string
  score: number
}
/** One track of an edition as the identity keeps it: its recording, and its title when read from MusicBrainz. */
export interface EditionRecording {
  recording: string | null
  title: string | null
}

/**
 * The recording of a track of the card, from its album's edition: by position when the card holds as many
 * tracks as the edition (the usual case), else by the title where the edition's titles are known.
 */
export function recordingOfTrack(
  albumTracks: readonly LibraryTrack[],
  track: Pick<Track, 'path' | 'title'>,
  edition: readonly EditionRecording[],
): string | null {
  const ordered = byTrackNumber(albumTracks)
  if (ordered.length === edition.length) {
    const index = ordered.findIndex((item) => item.path === track.path)
    const found = index >= 0 ? edition[index]?.recording : null
    if (found) return found
  }
  const key = foldName(track.title)
  return edition.find((item) => item.title && foldName(item.title) === key)?.recording ?? null
}

export interface SimilarTrack {
  track: LibraryTrack
  score: number
}
export interface SimilarTracks {
  onCard: SimilarTrack[]
  /** Similar recordings the card lacks. */
  absent: number
}

/**
 * The similar recordings the card holds, in ListenBrainz's order, each track once and never the seed: by the
 * track's recording where known, else by the title and the credit read loosely (the credit as a whole, or one
 * artist of it named in ListenBrainz's).
 */
export function similarTracksOnCard(
  similar: readonly SimilarRecording[],
  tracks: readonly LibraryTrack[],
  seed: Pick<Track, 'path'>,
  recordingOf: (track: LibraryTrack) => string | null,
): SimilarTracks {
  const byRecording = new Map<string, LibraryTrack>()
  const byName = new Map<string, LibraryTrack[]>()
  for (const track of tracks) {
    if (track.path === seed.path || !track.path) continue
    const recording = recordingOf(track)
    if (recording && !byRecording.has(recording)) byRecording.set(recording, track)
    const key = foldName(track.title)
    byName.set(key, [...(byName.get(key) ?? []), track])
  }
  const credited = (track: LibraryTrack, artist: string): boolean => {
    if (!track.artist) return false
    const wanted = foldName(artist)
    return (
      foldName(creditLabel(track.artist)) === wanted ||
      creditArtists(track.artist).some((name) => foldName(name) !== '' && wanted.includes(foldName(name)))
    )
  }
  const self = tracks.find((track) => track.path === seed.path) ?? null
  const onCard: SimilarTrack[] = []
  const taken = new Set<string>()
  let absent = 0
  for (const recording of similar) {
    const track =
      byRecording.get(recording.mbid) ??
      byName.get(foldName(recording.name))?.find((item) => credited(item, recording.artist)) ??
      null
    if (!track?.path) {
      // The seed itself, spelled as ListenBrainz spells it, is neither here nor lacking.
      if (!(self && foldName(self.title) === foldName(recording.name) && credited(self, recording.artist))) absent++
      continue
    }
    if (taken.has(track.path)) continue
    taken.add(track.path)
    onCard.push({ track, score: recording.score })
  }
  return { onCard, absent }
}
