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

/**
 * The label colour of each placeholder record (ArtworkSleeve; owner,
 * 2026-09-29: flat, in the page's own colours): the coral accent, sage,
 * sand, clay, stone and moss, all light enough to stand out on the black
 * record. Also the tint around a sleeve.
 */
export const SLEEVE_TONES = ['#f35c3f', '#6f7b63', '#c9b48f', '#b8745a', '#8a8f86', '#b5bd9c'] as const
/** Label text: ink on the light sand and moss, white on the rest. */
export const SLEEVE_INK = ['#fff', '#fff', '#30362b', '#fff', '#fff', '#30362b'] as const
