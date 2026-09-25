/**
 * Typographic placeholder sleeves for items without observed artwork, as in
 * the reference (app.js art()): a 32-bit Java-style hash over the code points
 * of the trimmed title picks one of six palettes, and the first two code
 * points become the letters. Decoration only; never stored as metadata.
 */
export const SLEEVE_PALETTES = 6

export interface Sleeve {
  palette: number
  letters: string
}

export function sleeve(title: string | null | undefined): Sleeve {
  const text = title?.trim() || '♪'
  let hash = 0
  for (const char of text) hash = (Math.imul(hash, 31) + (char.codePointAt(0) ?? 0)) >>> 0
  return { palette: hash % SLEEVE_PALETTES, letters: Array.from(text).slice(0, 2).join('').toUpperCase() }
}

/** The middle tone of each sleeve palette (ArtworkSleeve), for tinting around a sleeve. */
export const SLEEVE_TONES = ['#638a78', '#ac746c', '#768ba6', '#b18b54', '#8a739a', '#84906b'] as const
