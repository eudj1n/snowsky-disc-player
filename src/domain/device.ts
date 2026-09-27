/**
 * Live facts about the player from the service's OS-level sources (next
 * image): the fuel gauge, the music card's space and the ALSA playback stream
 * that feeds the DAC. Each part is null when the service cannot read it.
 */

export interface BatteryFacts {
  capacity: number
  voltageMv: number | null
  temperatureC: number | null
  cycles: number | null
}

export interface OutputFacts {
  active: boolean
  device: string | null
  format: string | null
  rate: number | null
  channels: number | null
}

export interface DeviceFacts {
  battery: BatteryFacts | null
  card: { totalBytes: number; freeBytes: number } | null
  output: OutputFacts | null
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
const text = (value: unknown): string | null => (typeof value === 'string' && value.length <= 32 ? value : null)

/** Validates the service's document; anything malformed reads as unknown. */
export function parseDeviceFacts(value: unknown): DeviceFacts {
  const doc = record(value)
  const battery = record(doc?.battery)
  const card = record(doc?.card)
  const output = record(doc?.output)
  const capacity = count(battery?.capacity)
  const total = count(card?.totalBytes)
  const free = count(card?.freeBytes)
  return {
    battery:
      battery && capacity !== null && capacity <= 100
        ? {
            capacity,
            voltageMv: count(battery.voltageMv),
            temperatureC: typeof battery.temperatureC === 'number' ? battery.temperatureC : null,
            cycles: count(battery.cycles),
          }
        : null,
    card: total !== null && free !== null && free <= total ? { totalBytes: total, freeBytes: free } : null,
    output: output
      ? {
          active: output.active === true,
          device: text(output.device),
          format: text(output.format),
          rate: count(output.rate),
          channels: count(output.channels),
        }
      : null,
  }
}

/** "18 GB", "860 MB": decimal units, as the card's label counts them. */
export function formatBytes(bytes: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit++
  }
  const digits = value < 10 && unit > 0 ? 1 : 0
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)} ${units[unit] ?? 'B'}`
}

/** How full the card looks: `critical` under 10 % free (where Windows turns a drive red), `low` under 25 %. */
export type SpaceLevel = 'ok' | 'low' | 'critical'

/** The used share of the card (0..1) and its level; null when the size is unknown. */
export function cardSpace(card: { totalBytes: number; freeBytes: number }): { used: number; level: SpaceLevel } | null {
  if (!(card.totalBytes > 0)) return null
  const free = Math.min(Math.max(card.freeBytes / card.totalBytes, 0), 1)
  return { used: 1 - free, level: free < 0.1 ? 'critical' : free < 0.25 ? 'low' : 'ok' }
}

/** "48 kHz", "44.1 kHz". */
export function formatRate(hertz: number): string {
  return `${String(Math.round(hertz / 100) / 10)} kHz`
}

/** The DAC gets another rate than the file has: stock resamples it. */
export function resampled(output: OutputFacts | null, fileRate: number | null | undefined): boolean {
  return Boolean(output?.active && output.rate && fileRate && output.rate !== fileRate)
}
