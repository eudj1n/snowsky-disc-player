/**
 * Wire parsing of the stock a202 now-playing observation (reply to 0202 and unsolicited push).
 * Mirrors the reference Controller (snowsky-disc-qemu controller/wire.py,
 * events.py and models.py): absent fields stay absent, partial records update
 * the previous state, a snapshot alone never proves a final stop, and
 * playing/paused require an observed track.
 */
import { playbackSource, UNKNOWN_PLAYBACK, type Playback, type PlaybackState } from '../domain/playback'
import type { Track } from '../domain/track'
import type { GatewaySession } from './session'

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
  // Quality as stock decodes it (song_encoding_rate carries the bit depth); zero means unknown.
  const positive = (key: string) => {
    const value = optionalCount(song, key)
    return value !== null && value > 0 ? value : null
  }
  return {
    title,
    artist,
    album,
    path,
    durationMs,
    queuePosition: position !== null && position > 0 ? position - 1 : null,
    sampleRate: positive('song_sample_rate'),
    bitDepth: positive('song_encoding_rate'),
    bitRate: positive('song_bit_rate'),
    dsd: song.is_dsd === true,
  }
}

/** The validated fields of one a202 record; `song` is always an object here. */
export type PlaybackWire = Readonly<Record<string, unknown>>

/**
 * Validates one a202 payload into its wire fields. An empty payload (seen
 * while loading and at the final EOF) carries no fields.
 */
export function playbackWire(payload: string): PlaybackWire {
  if (payload === '') return {}
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
  if (!('song' in wire)) return wire
  const song = object(typeof wire.song === 'string' ? JSON.parse(wire.song) : wire.song, 'song')
  parseTrack(song) // validates the song fields
  return { ...wire, song }
}

function sameSong(a: unknown, b: unknown): boolean {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const left = a as Wire
  const right = b as Wire
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key])
}

/**
 * Reduces a partial a202 into the previous state (reference events.merge_snapshot):
 * a different song replaces everything, state 2 (loading or end) clears the
 * previous song, an empty record changes nothing, and anything else, such as
 * `{"state":0}` after a track switch, updates only its own fields.
 */
export function mergePlayback(state: PlaybackWire, update: PlaybackWire): PlaybackWire {
  if (Object.keys(update).length === 0) return state
  const song = update.song as Wire | undefined
  if (song && Object.keys(song).length > 0) {
    if (!sameSong(song, state.song)) state = {}
  } else if (update.state === 2) {
    state = {}
  }
  return { ...state, ...update }
}

/** The domain view of reduced wire fields. */
export function playbackOf(wire: PlaybackWire): Playback {
  if (Object.keys(wire).length === 0) return UNKNOWN_PLAYBACK
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

/** Parses one a202 payload on its own (tests and complete replies). */
export function parsePlayback(payload: string): Playback {
  return playbackOf(playbackWire(payload))
}

/** Reduced now-playing state per session, fed by every a202 it receives. */
const reduced = new WeakMap<GatewaySession, { wire: PlaybackWire }>()

function entry(session: GatewaySession): { wire: PlaybackWire } {
  let found = reduced.get(session)
  if (!found) {
    const created = { wire: {} as PlaybackWire }
    found = created
    reduced.set(session, created)
    session.onRecord((record) => {
      if (record.tag !== 'a202') return
      try {
        created.wire = mergePlayback(created.wire, playbackWire(record.payload))
      } catch {
        // An invalid record changes nothing; readers see the last valid state.
      }
    })
    session.onClose(() => (created.wire = {}))
  }
  return found
}

/**
 * Starts reducing a session's a202 records. Call it as soon as the session
 * opens, before other listeners, so they read the updated state.
 */
export function trackPlayback(session: GatewaySession): void {
  entry(session)
}

/** The session's reduced now-playing state. */
export function currentPlayback(session: GatewaySession): Playback {
  return playbackOf(entry(session).wire)
}

/** A fresh 0202 read, reduced into the session state; returns that state. */
export async function readPlayback(session: GatewaySession, timeoutMs?: number): Promise<Playback> {
  const state = entry(session)
  const payload = await session.read('0202', 'a202', '', timeoutMs)
  // Listeners already applied it; merging the same record again changes nothing.
  state.wire = mergePlayback(state.wire, playbackWire(payload))
  return playbackOf(state.wire)
}

/** A fresh 0202 read as wire fields, for verifications that reduce from scratch. */
export async function readPlaybackWire(session: GatewaySession, timeoutMs?: number): Promise<PlaybackWire> {
  entry(session)
  return playbackWire(await session.read('0202', 'a202', '', timeoutMs))
}
