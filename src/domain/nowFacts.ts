/**
 * What the Now tab says about the playing track (owner, 2026-09-29): facts
 * gathered from stock's play state, the track's library row, its file as the
 * media route measured it and the service's play history, each only when
 * known. Plain data; the panel names, formats and links them.
 */
import { stockUnknown } from './album'
import { sameCredit } from './artist'
import type { ServicePlay } from './history'
import type { FileFacts } from './space'
import { sameTrack, type LibraryTrack, type Track } from './track'

export interface TrackFacts {
  /** kbit/s, as stock reports it for the playing file, else as measured. */
  bitRate: number | null
  channels: number | null
  year: number | null
  /** The library's genre, unless stock's placeholder. */
  genre: string | null
  disc: number | null
  trackNumber: number | null
  /** The album artist, only when it differs from the track's own credit. */
  albumArtist: string | null
  bytes: number | null
  /** The file's folder on the card (absolute). */
  folder: string | null
  plays: number
  /** Seconds since the epoch of the latest recorded play. */
  lastPlayedAt: number | null
  /** ADD_TIME, seconds since the epoch. */
  addedAt: number | null
}

/** The library row of a track: its file, and for a CUE track its title too. */
export function libraryRow<T extends LibraryTrack>(tracks: readonly T[], track: Track | null): T | null {
  if (!track?.path) return null
  return tracks.find((row) => sameTrack(row, track)) ?? null
}

export function trackFacts(input: {
  track: Track
  library: LibraryTrack | null
  file: FileFacts | null
  year: number | null
  plays: readonly ServicePlay[]
}): TrackFacts {
  const { track, library, file } = input
  const own = input.plays.filter(
    (play) => play.path === track.path && (!track.cue || (play.title ?? '').trim() === track.title.trim()),
  )
  const albumArtist = library?.albumArtist ?? null
  const cut = track.path ? track.path.lastIndexOf('/') : -1
  return {
    bitRate: track.bitRate ?? file?.bitRate ?? null,
    channels: file?.channels ?? null,
    year: input.year,
    genre: library?.genre && !stockUnknown(library.genre) ? library.genre : null,
    disc: library?.discNumber || null,
    trackNumber: library?.trackNumber || null,
    albumArtist:
      albumArtist && !stockUnknown(albumArtist) && !(track.artist && sameCredit(albumArtist, track.artist))
        ? albumArtist
        : null,
    bytes: file?.bytes ?? null,
    folder: track.path && cut > 0 ? track.path.slice(0, cut) : null,
    plays: own.length,
    lastPlayedAt: own.reduce<number | null>(
      (latest, play) => (latest === null || play.at > latest ? play.at : latest),
      null,
    ),
    addedAt: library?.addedAt ?? null,
  }
}
