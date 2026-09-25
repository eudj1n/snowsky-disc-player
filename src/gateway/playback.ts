/**
 * Wire parsing of the stock a202 now-playing observation (reply to 0202 and unsolicited push).
 * Mirrors the reference Controller (snowsky-disc-qemu controller/wire.py and
 * models.py): absent fields stay absent, a snapshot alone never proves a final
 * stop, and playing/paused require an observed track.
 */
import { playbackSource, UNKNOWN_PLAYBACK, type Playback, type PlaybackState } from '../domain/playback'
import type { Track } from '../domain/track'

type Wire = Record<string, unknown>

function object(value: unknown, what: string): Wire {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new SyntaxError(`now-playing ${what} must be an object`)
  return value as Wire
}
function optionalString(song: Wire, key: string): string | null {
  if (!(key in song)) return null
  if (typeof song[key] !== 'string') throw new SyntaxError(`now-playing ${key} must be a string`)
  return song[key] === '' ? null : song[key]
}
function optionalCount(song: Wire, key: string): number | null {
  if (!(key in song)) return null
  const value = song[key]
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    throw new SyntaxError(`now-playing ${key} must be a nonnegative integer`)
  return value
}

function parseTrack(value: unknown): Track | null {
  const song = object(typeof value === 'string' ? JSON.parse(value) : value, 'song')
  const title = optionalString(song, 'song_name')
  const artist = optionalString(song, 'song_artist_name')
  const album = optionalString(song, 'song_album_name')
  const path = optionalString(song, 'song_file_path')
  const position = optionalCount(song, 'pos_id')
  const durationMs = optionalCount(song, 'song_duration_time')
  if (!title) return null
  return {
    title,
    artist,
    album,
    path,
    durationMs,
    queuePosition: position !== null && position > 0 ? position - 1 : null,
  }
}

/** Parses one a202 payload. An empty payload (loading, final EOF) is unknown. */
export function parsePlayback(payload: string): Playback {
  if (payload === '') return UNKNOWN_PLAYBACK
  const wire = object(JSON.parse(payload), 'payload')
  for (const [key, kind] of [
    ['state', 'number'],
    ['playerflag', 'number'],
    ['love', 'boolean'],
  ] as const) {
    if (key in wire && (typeof wire[key] !== kind || (kind === 'number' && !Number.isInteger(wire[key])))) {
      throw new SyntaxError(`now-playing ${key} has an invalid type`)
    }
  }
  const track = 'song' in wire ? parseTrack(wire.song) : null
  let state: PlaybackState = 'unknown'
  if (track && (wire.state === 0 || wire.state === 1)) state = wire.state === 0 ? 'playing' : 'paused'
  if (wire.state === 2) state = 'loading'
  const flag = wire.playerflag
  return {
    state,
    track,
    favorite: typeof wire.love === 'boolean' ? wire.love : null,
    source: typeof flag === 'number' ? playbackSource(flag) : null,
  }
}
