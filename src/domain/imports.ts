/**
 * Selection rules for importing music (reference imports.mjs validFiles and
 * backend imports.py): up to 1000 audio files (with their lyrics and folder
 * covers), unique paths (case-insensitive),
 * sizes within the upload bound, FAT-safe names, bounded path lengths.
 */
export const AUDIO_EXTENSIONS = [
  '.flac',
  '.wav',
  '.mp3',
  '.m4a',
  '.aac',
  '.ogg',
  '.ape',
  '.wma',
  '.dsf',
  '.dff',
] as const
export const MAX_IMPORT_FILES = 1000
/** Stock's signed 31-bit Content-Length; the gateway catalog may bound it lower. */
export const STOCK_UPLOAD_LIMIT = 2 ** 31 - 1
export const CARD_ROOT = '/tmp/sdcard/'

// eslint-disable-next-line no-control-regex -- control characters are exactly what FAT rejects
const INVALID = /[\\\u0000-\u001f\u007f:*?"<>|]/
const encoder = new TextEncoder()

export function isAudio(path: string): boolean {
  const lower = path.toLowerCase()
  return AUDIO_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

/**
 * Files that travel with the music because the gateway reads them (service
 * combined-006): same-stem lyrics and a folder cover. Their bounds match what
 * the gateway serves; the card catalog admits only these names besides audio.
 */
const LYRICS = /\.lrc$/i
const COVER = /(^|\/)(cover|folder|front)\.(jpe?g|png)$/i
export const LYRICS_LIMIT = 256 * 1024
export const COVER_LIMIT = 8 * 1024 * 1024

export function companionLimit(path: string): number | null {
  if (LYRICS.test(path)) return LYRICS_LIMIT
  if (COVER.test(path)) return COVER_LIMIT
  return null
}

/** Audio, or a lyrics/cover companion within its bound. */
export function importable(path: string, size: number): boolean {
  if (isAudio(path)) return true
  const limit = companionLimit(path)
  return limit !== null && size <= limit
}

export function validPath(path: string): boolean {
  if (!path || INVALID.test(path) || encoder.encode(CARD_ROOT + path).length > 1023) return false
  return path
    .split('/')
    .every(
      (part) =>
        part !== '' &&
        part !== '.' &&
        part !== '..' &&
        part === part.trim() &&
        !part.endsWith('.') &&
        encoder.encode(part).length <= 240,
    )
}

export interface ImportCandidate {
  path: string
  size: number
}

/** The whole selection is valid, or it is refused as a whole (reference). */
export function validSelection(files: readonly ImportCandidate[], limit: number): boolean {
  if (files.length < 1 || files.length > MAX_IMPORT_FILES) return false
  const seen = new Set<string>()
  for (const file of files) {
    const key = file.path.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    if (!(file.size > 0 && file.size <= limit) || !validPath(file.path) || !importable(file.path, file.size))
      return false
  }
  return true
}

/** "Album/Disc 1" and "Track.flac" of a relative path. */
export function splitPath(path: string): { folder: string; name: string } {
  const index = path.lastIndexOf('/')
  return index < 0 ? { folder: '', name: path } : { folder: path.slice(0, index), name: path.slice(index + 1) }
}

export function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}
