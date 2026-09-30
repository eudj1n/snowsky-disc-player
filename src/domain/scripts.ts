/**
 * Names from the collection in any script (docs/typography.md). Two things the
 * interface language cannot decide for a name:
 *
 * - Direction: a Hebrew or Arabic name next to numbers or separators in one
 *   line reorders them ("فيروز · 1991" showed the year first). A name with a
 *   right-to-left letter is wrapped in first-strong isolates (U+2068 … U+2069),
 *   the text form of <bdi>; other names are left untouched.
 * - Glyph forms: Chinese, Japanese and Korean share ideographs drawn
 *   differently per language, and the document's language is the interface's.
 *   Kana mark a name as Japanese and hangul as Korean; ideographs alone stay
 *   with the document's language (Chinese or Japanese cannot be told apart).
 */

const RIGHT_TO_LEFT = /[֐-ࣿיִ-﷿ﹰ-ﻼ]/u
const KANA = /[぀-ヿㇰ-ㇿｦ-ﾟ]/u
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/u

const FIRST_STRONG_ISOLATE = '⁨'
const POP_DIRECTIONAL_ISOLATE = '⁩'

/** The name isolated from its neighbours when it holds a right-to-left letter. */
export function isolateName(name: string): string {
  return RIGHT_TO_LEFT.test(name) ? `${FIRST_STRONG_ISOLATE}${name}${POP_DIRECTIONAL_ISOLATE}` : name
}

/** The language a text's own script tells: Japanese for kana, Korean for hangul, else null. */
export function scriptLanguage(text: string): 'ja' | 'ko' | null {
  if (KANA.test(text)) return 'ja'
  if (HANGUL.test(text)) return 'ko'
  return null
}
