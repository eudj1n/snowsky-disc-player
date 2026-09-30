/**
 * The queue this browser plays (owner, 2026-09-30: one switch between the
 * player and this browser). Pure rules: which files a browser can decode, and
 * which track comes next or before under the repeat mode.
 */

/** Media types to ask the browser about, by file extension; none for what no browser decodes (APE, DSD, WavPack, WMA). */
const TYPES: Readonly<Record<string, string>> = {
  flac: 'audio/flac',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg; codecs=opus',
  webm: 'audio/webm',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
}

/** The media type a file's name suggests, or null when no browser plays it. */
export function browserType(path: string): string | null {
  const extension = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase()
  return extension ? (TYPES[extension] ?? null) : null
}

/**
 * Whether this browser can play the file, asked with its media type. An ALAC
 * file in `.m4a` passes here and is caught by the decoding error.
 */
export function playableIn(path: string | null, canPlayType: (type: string) => string): boolean {
  const type = path ? browserType(path) : null
  return type !== null && canPlayType(type) !== ''
}

export type Repeat = 'off' | 'all' | 'one'

/**
 * The track after `index`: the same one when one track repeats and it ended
 * by itself (a press of Next moves on), the first again when the queue
 * repeats, never one that cannot play; null at the end.
 */
export function nextIndex(
  count: number,
  index: number,
  repeat: Repeat,
  playable: (index: number) => boolean,
  pressed = false,
): number | null {
  if (repeat === 'one' && !pressed && index >= 0 && playable(index)) return index
  for (let step = 1; step <= count; step++) {
    const next = index + step
    if (next >= count && repeat === 'off') return null
    const wrapped = next % count
    if (playable(wrapped)) return wrapped
  }
  return null
}

/** The track before `index`, wrapping when the queue repeats; null at the start. */
export function previousIndex(
  count: number,
  index: number,
  repeat: Repeat,
  playable: (index: number) => boolean,
): number | null {
  for (let step = 1; step <= count; step++) {
    const previous = index - step
    if (previous < 0 && repeat === 'off') return null
    const wrapped = ((previous % count) + count) % count
    if (playable(wrapped)) return wrapped
  }
  return null
}
