/**
 * Current-state operations after the reference Controller (controls.py,
 * current.py, seeking.py). Each sends at most one mutation, confirms it with
 * fresh reads within 8 s and never resends:
 *
 * - transport: pause/resume/next/previous (0201) confirmed by the wanted state
 *   on the same track, or a track change / restart;
 * - volume (0502) confirmed by 0501 currentVolume;
 * - play mode (0102) confirmed by one 0105 read (reply a102);
 * - current-track favorite (0104) confirmed by the a202 love flag, guarded by
 *   two fresh observations of the same track before the send;
 * - seek (0103) confirmed by a103 ticks within [target, target + elapsed +
 *   1000] while playing; a paused seek is reported as waiting.
 */
import type { Playback, TransportAction } from '../domain/playback'
import type { Track } from '../domain/track'
import { parsePlayback } from './playback'
import { NoObservation, type GatewaySession } from './session'
import { currentVolume } from './settings'

export type Outcome = 'confirmed' | 'already' | 'not-sent' | 'uncertain'

export interface ControlDeps {
  session: GatewaySession
  /** Throws when scan activity was observed; nothing is sent then. */
  guard: () => void
  /** Marks the single mutation attempt right before the send. */
  attempted: () => void
  timeoutMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export class UnknownPlayback extends Error {}

const hex4 = (value: number) => value.toString(16).toUpperCase().padStart(4, '0')
const hex8 = (value: number) => value.toString(16).toUpperCase().padStart(8, '0')
const clock = (deps: ControlDeps) => ({
  now: deps.now ?? Date.now,
  sleep: deps.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms))),
  timeout: deps.timeoutMs ?? 8000,
})

/** A fresh 0202 read that must show a track playing or paused (reference observe()). */
export async function observe(session: GatewaySession): Promise<Playback & { track: Track }> {
  let playback: Playback
  try {
    playback = parsePlayback(await session.read('0202', 'a202'))
  } catch (error) {
    if (error instanceof NoObservation) throw new UnknownPlayback('No current playback')
    throw error
  }
  if (!playback.track || (playback.state !== 'playing' && playback.state !== 'paused')) {
    throw new UnknownPlayback('No current playback')
  }
  return playback as Playback & { track: Track }
}

/** Track identity as the reference compares it: source, title, artist, album, position. */
export function identityOf(playback: Playback): string | null {
  const track = playback.track
  return track ? JSON.stringify([playback.source, track.title, track.artist, track.album, track.queuePosition]) : null
}

/** Collects records of one tag that arrive after this call. */
function collect(
  session: GatewaySession,
  tag: string,
): { values: { payload: string; at: number }[]; stop: () => void } {
  const values: { payload: string; at: number }[] = []
  const stop = session.onRecord((record) => {
    if (record.tag === tag) values.push({ payload: record.payload, at: Date.now() })
  })
  return { values, stop }
}

async function send(deps: ControlDeps, tag: string, payload: string): Promise<boolean> {
  deps.guard()
  deps.attempted()
  const outcome = await deps.session.mutate(tag, payload, null)
  return outcome.status !== 'unsent'
}

export async function transportAction(deps: ControlDeps, action: TransportAction): Promise<Outcome> {
  const { now, sleep, timeout } = clock(deps)
  let before: Playback & { track: Track }
  try {
    before = await observe(deps.session)
  } catch {
    return 'not-sent'
  }
  const payload = action === 'toggle' ? '0000' : action === 'next' ? '0001' : '0002'
  const wanted = before.state === 'playing' ? 'paused' : 'playing'
  const ticks = collect(deps.session, 'a103')
  try {
    if (!(await send(deps, '0201', payload))) return 'not-sent'
  } catch {
    ticks.stop()
    return 'not-sent'
  }
  const deadline = now() + timeout
  try {
    while (now() < deadline && deps.session.open) {
      try {
        const after = await observe(deps.session)
        const same = identityOf(after) === identityOf(before)
        if (action === 'toggle' && same && after.state === wanted) return 'confirmed'
        if (action !== 'toggle' && !same) return 'confirmed'
        // Stock "previous" after 10 s restarts the same track: a tick back to the start.
        if (action === 'previous' && same && ticks.values.some(({ payload: p }) => parseInt(p, 16) <= 2000))
          return 'confirmed'
      } catch {
        // Keep waiting within the deadline; nothing is resent.
      }
      await sleep(150)
    }
    return 'uncertain'
  } finally {
    ticks.stop()
  }
}

export async function setVolume(deps: ControlDeps, value: number): Promise<Outcome> {
  if (!Number.isInteger(value) || value < 0 || value > 120) throw new RangeError('Volume outside 0..120')
  const { now, sleep, timeout } = clock(deps)
  let previous: number | null
  try {
    previous = currentVolume(await deps.session.read('0501', 'a501'))
  } catch {
    return 'not-sent'
  }
  if (previous === null) return 'not-sent'
  if (previous === value) return 'already'
  try {
    if (!(await send(deps, '0502', hex4(value)))) return 'not-sent'
  } catch {
    return 'not-sent'
  }
  const deadline = now() + timeout
  while (now() < deadline && deps.session.open) {
    try {
      if (currentVolume(await deps.session.read('0501', 'a501')) === value) return 'confirmed'
    } catch {
      return 'uncertain'
    }
    await sleep(100)
  }
  return 'uncertain'
}

async function readMode(session: GatewaySession): Promise<number | null> {
  const payload = await session.read('0105', 'a102')
  const value = /^[0-9a-fA-F]{4}$/.test(payload) ? parseInt(payload, 16) : NaN
  return value >= 0 && value <= 4 ? value : null
}

export async function setMode(deps: ControlDeps, mode: number): Promise<Outcome> {
  if (!Number.isInteger(mode) || mode < 0 || mode > 4) throw new RangeError('Play mode outside 0..4')
  let previous: number | null
  try {
    previous = await readMode(deps.session)
  } catch {
    return 'not-sent'
  }
  if (previous === null) return 'not-sent'
  if (previous === mode) return 'already'
  try {
    if (!(await send(deps, '0102', hex4(mode)))) return 'not-sent'
  } catch {
    return 'not-sent'
  }
  try {
    return (await readMode(deps.session)) === mode ? 'confirmed' : 'uncertain'
  } catch {
    return 'uncertain'
  }
}

export async function setFavorite(deps: ControlDeps, wanted: boolean, displayed: string | null): Promise<Outcome> {
  const { now, sleep, timeout } = clock(deps)
  let before: Playback & { track: Track }
  try {
    before = await observe(deps.session)
    if (typeof before.favorite !== 'boolean') return 'not-sent'
    if (displayed !== null && identityOf(before) !== displayed) return 'not-sent'
    if (before.favorite === wanted) return 'already'
    deps.guard()
    const fresh = await observe(deps.session)
    if (identityOf(fresh) !== identityOf(before) || fresh.favorite !== before.favorite) return 'not-sent'
  } catch {
    return 'not-sent'
  }
  try {
    if (!(await send(deps, '0104', wanted ? '0001' : '0000'))) return 'not-sent'
  } catch {
    return 'not-sent'
  }
  const deadline = now() + timeout
  while (now() < deadline && deps.session.open) {
    try {
      const state = await observe(deps.session)
      if (identityOf(state) !== identityOf(before)) return 'uncertain'
      if (state.favorite === wanted) return 'confirmed'
    } catch {
      return 'uncertain'
    }
    await sleep(100)
  }
  return 'uncertain'
}

export type SeekOutcome = Outcome | 'waiting'

/** Seeks the displayed track. `displayed` is identityOf() of what the user saw. */
export async function seek(
  deps: ControlDeps,
  displayed: string,
  durationMs: number | null,
  positionMs: number,
): Promise<SeekOutcome> {
  if (!Number.isInteger(positionMs) || positionMs < 0 || positionMs > 0x7fffffff)
    throw new RangeError('Seek outside range')
  const { now, sleep, timeout } = clock(deps)
  let before: Playback & { track: Track }
  try {
    before = await observe(deps.session)
  } catch {
    return 'not-sent'
  }
  const duration = before.track.durationMs ?? durationMs
  if (identityOf(before) !== displayed || duration === null || positionMs >= duration) return 'not-sent'
  const target = Math.floor(positionMs / 1000) * 1000
  const ticks = collect(deps.session, 'a103')
  let sentAt: number
  try {
    if (!(await send(deps, '0103', hex8(positionMs)))) return 'not-sent'
    sentAt = now()
  } catch {
    ticks.stop()
    return 'not-sent'
  }
  if (before.state === 'paused') {
    ticks.stop()
    return 'waiting'
  }
  try {
    const deadline = sentAt + timeout
    while (now() < deadline && deps.session.open) {
      const elapsed = now() - sentAt
      if (
        ticks.values.some(({ payload }) => {
          const value = parseInt(payload, 16)
          return value >= target && value <= target + elapsed + 1000
        })
      )
        return 'confirmed'
      try {
        if (identityOf(await observe(deps.session)) !== displayed) return 'uncertain'
      } catch {
        // Unknown playback for a moment: keep waiting within the deadline.
      }
      await sleep(100)
    }
    return 'uncertain'
  } finally {
    ticks.stop()
  }
}
