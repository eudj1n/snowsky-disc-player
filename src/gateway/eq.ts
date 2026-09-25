/**
 * Equalizer through the reviewed records, after the reference Controller
 * (fiio_settings.py, peq_check.py, settings_check.py):
 *
 * - `0639`/`0690` preset (network enum; user presets 160..169),
 * - `0629`/`0630` master gain (signed 16-bit tenths of dB, -24..12),
 * - `0628`/`0678` PEQ bands (binary read, JSON write).
 *
 * Every change reads the current value fresh first (a different value than
 * displayed is `stale`, nothing sent), sends once and polls the read until it
 * shows the target. Bands and master change only while a user preset is
 * selected. BYPASS (240), 7 and 254 are never sent.
 */
import { isUserPreset, sendablePreset, tenth, validBand, type EqState, type PeqBand } from '../domain/eq'
import type { GatewaySession } from './session'

export { DEFAULT_BANDS, EQ_PRESETS, isUserPreset, USER_PRESETS, type EqState, type PeqBand } from '../domain/eq'

const hex4 = (value: number) => (value & 0xffff).toString(16).toUpperCase().padStart(4, '0')

export function decodeMaster(payload: string): number {
  if (!/^[0-9A-Fa-f]{4}$/.test(payload)) throw new SyntaxError('Invalid master gain reply')
  const n = parseInt(payload, 16)
  return (n < 0x8000 ? n : n - 0x10000) / 10
}

export function encodeMaster(db: number): string {
  if (!Number.isFinite(db) || db < -24 || db > 12 || !tenth(db))
    throw new RangeError('Master gain is -24..12 dB in 0.1 steps')
  return hex4(Math.round(db * 10))
}

export function decodePreset(payload: string): number {
  if (!/^[0-9A-Fa-f]{4}$/.test(payload)) throw new SyntaxError('Invalid EQ preset reply')
  return parseInt(payload, 16)
}

/** a628: "0000" + hex bytes: first, last, then 7 bytes per band (gain/10 i16, Hz u16, Q/100 u16, type u8). */
export function parsePeq(payload: string): PeqBand[] {
  if (!payload.startsWith('0000') || !/^[0-9A-Fa-f]*$/.test(payload)) throw new SyntaxError('Invalid PEQ reply')
  const hex = payload.slice(4)
  const byte = (index: number) => parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  const word = (index: number) => (byte(index) << 8) | byte(index + 1)
  const first = byte(0)
  const last = byte(1)
  if (!(first >= 0 && first <= last && last <= 9) || hex.length !== (2 + 7 * (last - first + 1)) * 2) {
    throw new SyntaxError('Invalid PEQ band range')
  }
  const bands: PeqBand[] = []
  for (let position = first, offset = 2; position <= last; position++, offset += 7) {
    const raw = word(offset)
    bands.push({
      position,
      gain: (raw < 0x8000 ? raw : raw - 0x10000) / 10,
      frequency: word(offset + 2),
      q: word(offset + 4) / 100,
    })
  }
  return bands
}

/** Python str(float(x)): 1 → "1.0", -3.5 → "-3.5", -0 → "0.0". */
export function pyFloat(value: number): string {
  const normalized = Object.is(value, -0) ? 0 : value
  return Number.isInteger(normalized) ? normalized.toFixed(1) : String(normalized)
}

/** 0678 payload: count, then compact JSON with gain and Q as strings (never the hex forms). */
export function peqPayload(bands: readonly PeqBand[]): string {
  const positions = new Set(bands.map((band) => band.position))
  if (!bands.length || bands.length > 10 || positions.size !== bands.length || !bands.every(validBand)) {
    throw new RangeError('One to ten valid, distinct PEQ bands are required')
  }
  const json = bands.map((band) => ({
    position: band.position,
    frequency: band.frequency,
    filterType: 0,
    gain: pyFloat(band.gain),
    qValue: pyFloat(band.q),
  }))
  return hex4(bands.length) + JSON.stringify(json)
}

export async function readEq(session: GatewaySession): Promise<EqState> {
  const preset = decodePreset(await session.read('0639', 'a639'))
  const master = decodeMaster(await session.read('0629', 'a629'))
  const bands = parsePeq(await session.read('0628', 'a628'))
  return { preset, master, bands }
}

export type EqOutcome = 'confirmed' | 'already' | 'stale' | 'not-sent' | 'uncertain' | 'invalid'

export interface EqDeps {
  session: GatewaySession
  guard: () => void
  attempted: () => void
  timeoutMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

const sameBands = (a: readonly PeqBand[], b: readonly PeqBand[]) =>
  a.length === b.length &&
  a.every((band, index) => {
    const other = b[index]
    return (
      other !== undefined &&
      band.position === other.position &&
      band.frequency === other.frequency &&
      Math.abs(band.gain - other.gain) < 0.05 &&
      Math.abs(band.q - other.q) < 0.005
    )
  })

/** Sends once after a fresh check, then polls a read until it shows the target. */
async function change<T>(
  deps: EqDeps,
  read: () => Promise<T>,
  ready: (current: T) => EqOutcome | null,
  send: () => Promise<{ status: string }>,
  done: (current: T) => boolean,
): Promise<EqOutcome> {
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  try {
    deps.guard()
    const verdict = ready(await read())
    if (verdict) return verdict
    deps.guard()
  } catch {
    return 'not-sent'
  }
  deps.attempted()
  const sent = await send()
  if (sent.status === 'unsent') return 'not-sent'
  const deadline = now() + (deps.timeoutMs ?? 8000)
  await sleep(150)
  while (now() < deadline && deps.session.open) {
    try {
      if (done(await read())) return 'confirmed'
    } catch {
      return 'uncertain'
    }
    await sleep(150)
  }
  return 'uncertain'
}

export function selectPreset(deps: EqDeps, displayed: number, target: number): Promise<EqOutcome> {
  if (!sendablePreset(target)) return Promise.resolve('invalid')
  return change(
    deps,
    async () => decodePreset(await deps.session.read('0639', 'a639')),
    (current) => (current !== displayed ? 'stale' : current === target ? 'already' : null),
    () => deps.session.mutate('0690', hex4(target), null),
    (current) => current === target,
  )
}

/** Writes edited bands while the displayed user preset is still selected. */
export function setBands(
  deps: EqDeps,
  preset: number,
  displayed: readonly PeqBand[],
  edited: readonly PeqBand[],
): Promise<EqOutcome> {
  let payload: string
  try {
    payload = peqPayload(edited)
  } catch {
    return Promise.resolve('invalid')
  }
  if (!isUserPreset(preset)) return Promise.resolve('invalid')
  const expected = displayed.map((band) => edited.find((next) => next.position === band.position) ?? band)
  return change(
    deps,
    async () => ({
      preset: decodePreset(await deps.session.read('0639', 'a639')),
      bands: parsePeq(await deps.session.read('0628', 'a628')),
    }),
    (current) =>
      current.preset !== preset || !sameBands(current.bands, displayed)
        ? 'stale'
        : sameBands(current.bands, expected)
          ? 'already'
          : null,
    () => deps.session.mutate('0678', payload, null),
    (current) => sameBands(current.bands, expected),
  )
}

/** Master gain of the selected user preset. */
export function setMaster(deps: EqDeps, preset: number, displayed: number, target: number): Promise<EqOutcome> {
  let payload: string
  try {
    payload = encodeMaster(target)
  } catch {
    return Promise.resolve('invalid')
  }
  if (!isUserPreset(preset)) return Promise.resolve('invalid')
  return change(
    deps,
    async () => ({
      preset: decodePreset(await deps.session.read('0639', 'a639')),
      master: decodeMaster(await deps.session.read('0629', 'a629')),
    }),
    (current) =>
      current.preset !== preset || current.master !== displayed
        ? 'stale'
        : current.master === target
          ? 'already'
          : null,
    () => deps.session.mutate('0630', payload, null),
    (current) => current.master === target,
  )
}
