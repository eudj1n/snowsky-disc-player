/** Names compared loosely: case, accents and punctuation aside. */

/** Lowercase letters and digits with single spaces: "Beyerdynamic DT-990 (250 Ω)" → "beyerdynamic dt 990 250 ω". */
export function foldName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}
