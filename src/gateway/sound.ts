/**
 * Sound settings after the reference Controller (fiio_settings.py, sound.py):
 * gain, channel balance, DAC filter, DRE and SPDIF output. Reads return four hex digits;
 * a change compares the fresh value with what the user saw (stale → not
 * sent), sends one setter and confirms with fresh reads within 8 s.
 */
import type { GatewaySession } from './session'

export type SoundName = 'gain' | 'balance' | 'filter' | 'dre' | 'spdif'
export type SoundValues = Record<SoundName, number>
export const SOUND_NAMES: readonly SoundName[] = ['gain', 'balance', 'filter', 'dre', 'spdif']

const WIRE: Record<SoundName, { read: string; reply: string; write: string }> = {
  gain: { read: '064a', reply: 'a64a', write: '0649' },
  balance: { read: '0712', reply: 'a712', write: '0713' },
  filter: { read: '0603', reply: 'a603', write: '0653' },
  dre: { read: '0813', reply: 'a813', write: '0812' },
  // Digital output on the 3.5 mm jack (FiiO Control's SPDIF switch; read on a V2.57 player).
  spdif: { read: '0824', reply: 'a824', write: '0823' },
}

/** Stock DAC filter labels by value (not localized). */
export const FILTER_LABELS = ['FAST_LL', 'SLOW_LL', 'SLOW_PC', 'FAST_PC', 'NON_OS', 'Wideband_FF'] as const

export function validSound(name: SoundName, value: number): boolean {
  if (!Number.isInteger(value)) return false
  if (name === 'balance') return value >= -20 && value <= 20
  if (name === 'filter') return value >= 0 && value <= 5
  return value === 0 || value === 1
}

/** Wire value of one read reply, or null when invalid. */
export function decodeSound(name: SoundName, payload: string): number | null {
  if (!/^[0-9a-fA-F]{4}$/.test(payload)) return null
  const raw = parseInt(payload, 16)
  if (name === 'balance') {
    const direction = raw >> 8
    const steps = raw & 0xff
    if (direction > 1 || steps > 20) return null
    return direction ? steps : -steps
  }
  if (name === 'filter') {
    const value = raw >= 9 && raw <= 14 ? raw - 9 : raw
    return value >= 0 && value <= 5 ? value : null
  }
  return raw === 0 || raw === 1 ? raw : null
}

export function encodeSound(name: SoundName, value: number): string {
  const wire = name === 'balance' ? (value > 0 ? 0x100 + value : -value) : name === 'filter' ? value + 9 : value
  return wire.toString(16).toUpperCase().padStart(4, '0')
}

/** "0", "L5", "R3" (reference balanceLabel). */
export function balanceLabel(value: number): string {
  return value === 0 ? '0' : value < 0 ? `L${-value}` : `R${value}`
}

async function readOne(session: GatewaySession, name: SoundName): Promise<number> {
  const spec = WIRE[name]
  const value = decodeSound(name, await session.read(spec.read, spec.reply))
  if (value === null) throw new SyntaxError(`Invalid ${name} reply`)
  return value
}

export async function readSound(session: GatewaySession): Promise<SoundValues> {
  const values: Partial<SoundValues> = {}
  for (const name of SOUND_NAMES) values[name] = await readOne(session, name)
  return values as SoundValues
}

export type SoundOutcome =
  | { status: 'confirmed' | 'already'; value: number }
  | { status: 'stale'; value: number }
  | { status: 'not-sent' }
  | { status: 'uncertain'; value: number | null }

export interface SoundDeps {
  session: GatewaySession
  guard: () => void
  attempted: () => void
  timeoutMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export async function changeSound(
  deps: SoundDeps,
  name: SoundName,
  value: number,
  expected: number,
): Promise<SoundOutcome> {
  if (!validSound(name, value) || !validSound(name, expected)) throw new RangeError(`Invalid ${name} value`)
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)))
  let before: number
  try {
    deps.guard()
    before = await readOne(deps.session, name)
    deps.guard()
  } catch {
    return { status: 'not-sent' }
  }
  if (before !== expected) return { status: 'stale', value: before }
  if (before === value) return { status: 'already', value }
  deps.attempted()
  const sent = await deps.session.mutate(WIRE[name].write, encodeSound(name, value), null)
  if (sent.status === 'unsent') return { status: 'not-sent' }
  let observed: number | null = null
  const deadline = now() + (deps.timeoutMs ?? 8000)
  while (now() < deadline && deps.session.open) {
    try {
      observed = await readOne(deps.session, name)
      deps.guard()
    } catch {
      return { status: 'uncertain', value: observed }
    }
    if (observed === value) return { status: 'confirmed', value }
    await sleep(150)
  }
  return { status: 'uncertain', value: observed }
}
