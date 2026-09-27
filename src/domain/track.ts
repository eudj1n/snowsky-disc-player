/** A track as every view shows it. Sources (playback observation, library
 * rows, queue, playlists) map their wire shapes into this one object. */
export interface Track {
  title: string
  artist: string | null
  album: string | null
  /** Zero-based position in the current queue, when the source knows it. */
  queuePosition: number | null
  /** Absolute path on the player, e.g. /tmp/sdcard/Album/01.flac. */
  path: string | null
  durationMs: number | null
  /** What stock reports for the playing track (a202): sample rate, bits, kbit/s, DSD. */
  sampleRate?: number | null
  bitDepth?: number | null
  bitRate?: number | null
  dsd?: boolean
  /** One track of a CUE sheet: several tracks share one file path (IS_CUE, a202 is_cue). */
  cue?: boolean
}

/** A track row from the stock library database (data level). */
export interface LibraryTrack extends Track {
  /** Stock SONG.ID: a database identity, not a stock list position. */
  id: number
  fileName: string
  albumArtist: string | null
  genre: string | null
  discNumber: number | null
  trackNumber: number | null
  /** ADD_TIME in seconds since the epoch. */
  addedAt: number | null
}

/**
 * One track's identity across the library, playlists, favorites and a202:
 * its file path, and for a CUE track also its title, since the tracks of one
 * CUE sheet share the file and stock reports no other distinguishing field
 * in a202 (song_track stays 0).
 */
export function trackKey(track: Pick<Track, 'path' | 'title' | 'cue'>): string | null {
  if (!track.path) return null
  return track.cue ? `${track.path}\u0000${track.title.trim()}` : track.path
}

/** The same track: the same file and, when either side is a CUE track, the same title. */
export function sameTrack(
  a: Pick<Track, 'path' | 'title' | 'cue'>,
  b: Pick<Track, 'path' | 'title' | 'cue'> | null,
): boolean {
  if (!b || !a.path || a.path !== b.path) return false
  return a.cue || b.cue ? a.title.trim() === b.title.trim() : true
}

/** Most recently added first (ADD_TIME); ties keep library order. */
export function recentlyAdded<T extends { addedAt: number | null }>(tracks: readonly T[], count: number): T[] {
  return [...tracks].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, count)
}

/** "Artist · Album" with unknown parts left out. */
export function trackCredits(track: Pick<Track, 'artist' | 'album'>): string {
  return [track.artist, track.album].filter((part): part is string => Boolean(part)).join(' · ')
}

/** m:ss or h:mm:ss; null when the duration is unknown (never guessed). */
export function formatDuration(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return null
  const total = Math.floor(ms / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

/** m:ss for player times; unknown is shown as —:— like the reference. */
export function timeLabel(ms: number | null): string {
  return formatDuration(ms) ?? '—:—'
}

/** File extension as a format badge (FLAC, WAV…), only from an observed path. */
export function formatBadge(path: string | null): string | null {
  const match = path ? /\.([A-Za-z0-9]{2,5})$/.exec(path) : null
  return match?.[1] ? match[1].toUpperCase() : null
}
