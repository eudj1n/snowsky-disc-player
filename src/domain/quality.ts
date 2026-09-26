/**
 * Audio quality as shown next to a track or an album: the file format, and
 * either bit depth / sample rate (lossless) or the bit rate (lossy). Hi-Res
 * means more than CD quality: over 16 bits or over 48 kHz, or DSD.
 */
export interface AudioQuality {
  /** Upper-case extension, e.g. FLAC, MP3, DSF. */
  format: string | null
  sampleRate: number | null
  bitDepth: number | null
  /** kbit/s, for lossy formats. */
  bitRate: number | null
  dsd: boolean
}

const LOSSY = new Set(['MP3', 'AAC', 'OGG', 'OPUS', 'WMA'])

export function isHiRes(quality: AudioQuality): boolean {
  return quality.dsd || (quality.bitDepth ?? 0) > 16 || (quality.sampleRate ?? 0) > 48_000
}

const khz = (rate: number) => {
  const value = rate / 1000
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/** "24/96", "16/44.1", "320 kbps", "DSD64", or null when nothing is known. */
export function qualityLabel(quality: AudioQuality): string | null {
  if (quality.dsd && quality.sampleRate) return `DSD${Math.round(quality.sampleRate / 44_100)}`
  const lossy = quality.format !== null && LOSSY.has(quality.format)
  if (lossy) return quality.bitRate ? `${quality.bitRate} kbps` : null
  if (quality.bitDepth && quality.sampleRate) return `${quality.bitDepth}/${khz(quality.sampleRate)}`
  if (quality.sampleRate) return `${khz(quality.sampleRate)} kHz`
  return null
}
