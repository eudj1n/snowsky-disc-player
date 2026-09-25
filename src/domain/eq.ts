/** Equalizer values as the stock reviews them (reference fiio_settings.py). */

/** Stock presets in the device menu order: network value and label key. */
export const EQ_PRESETS = [
  { wire: 255, key: 'eq_off' },
  { wire: 0, key: 'eq_jazz' },
  { wire: 2, key: 'eq_rock' },
  { wire: 4, key: 'eq_rnb' },
  { wire: 6, key: 'eq_hiphop' },
  { wire: 1, key: 'eq_pop' },
  { wire: 3, key: 'eq_dance' },
  { wire: 5, key: 'eq_classical' },
  { wire: 8, key: 'eq_retro' },
  { wire: 9, key: 'eq_sibilance_1' },
  { wire: 10, key: 'eq_sibilance_2' },
] as const
export const USER_PRESETS = Array.from({ length: 10 }, (_, index) => 160 + index)
const SENDABLE = new Set<number>([...EQ_PRESETS.map((preset) => preset.wire), ...USER_PRESETS])

export const isUserPreset = (value: number | null): value is number => value !== null && value >= 160 && value <= 169
export const sendablePreset = (value: number) => SENDABLE.has(value)

export interface PeqBand {
  position: number
  frequency: number
  gain: number
  q: number
}

export interface EqState {
  preset: number
  master: number
  bands: PeqBand[]
}

/** Default user-slot bands (reference): octave centers, flat, Q 0.7. */
export const DEFAULT_BANDS: PeqBand[] = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].map(
  (frequency, position) => ({ position, frequency, gain: 0, q: 0.7 }),
)

export const tenth = (value: number) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9

export function validBand(band: PeqBand): boolean {
  return (
    Number.isInteger(band.position) &&
    band.position >= 0 &&
    band.position <= 9 &&
    Number.isInteger(band.frequency) &&
    band.frequency >= 20 &&
    band.frequency <= 20000 &&
    Number.isFinite(band.gain) &&
    band.gain >= -24 &&
    band.gain <= 12 &&
    tenth(band.gain) &&
    Number.isFinite(band.q) &&
    band.q >= 0.1 &&
    band.q <= 20
  )
}
