/**
 * AutoEq's headphone corrections as the page understands them (owner,
 * 2026-10-20; docs/autoeq.md): a result of the recommended index, a fixed
 * band correction (ten peaking filters, the DISC's ten bands one to one),
 * whether it fits the player, and finding headphones as the listener types:
 * every word of the query must occur in the model's name, case, accents and
 * punctuation aside, and the closest names come first.
 */
import { tenth, validBand, type PeqBand } from './eq'
import { foldName } from './fold'

/** The AutoEq commit the page reads (the pin moves by hand with a release), and when its results were pushed. */
export const AUTOEQ_REVISION = '7ae0f56d53074872b028649617a22bbb4232feb7'
export const AUTOEQ_RESULTS_DATE = '2025-07-20'
export const AUTOEQ_SITE = 'https://github.com/jaakkopasanen/AutoEq'
/** How many bands a fixed band result has: the DISC's. */
export const BANDS = 10

export type HeadphoneForm = 'over-ear' | 'in-ear' | 'earbud'
export const FORMS: readonly HeadphoneForm[] = ['over-ear', 'in-ear', 'earbud']

/** One headphone of the recommended index. */
export interface HeadphoneResult {
  /** The model, as AutoEq names it. */
  name: string
  /** Who measured it. */
  source: string
  /** The measurement rig, when the source has more than one. */
  rig: string | null
  form: HeadphoneForm
  /** The result's folder under results/, decoded: "source/rig form/name". */
  path: string
}

/** A fixed band correction: the preamp and ten peaking bands, as the DISC takes them. */
export interface Correction {
  preamp: number
  bands: PeqBand[]
}

/** The correction fits the DISC's bounds: every band valid, the preamp a master level in 0.1 dB steps. */
export function fitsPlayer(correction: Correction): boolean {
  return (
    correction.bands.length === BANDS &&
    correction.bands.every(validBand) &&
    correction.preamp >= -24 &&
    correction.preamp <= 12 &&
    tenth(correction.preamp)
  )
}

export interface HeadphoneMatches {
  results: HeadphoneResult[]
  /** How many matched in all, beyond the ones returned. */
  total: number
}

/** The headphones every word of the query names, the closest first; none for an empty query. */
export function matchHeadphones(index: readonly HeadphoneResult[], query: string, limit: number): HeadphoneMatches {
  const words = foldName(query)
    .split(' ')
    .filter((word) => word !== '')
  if (!words.length) return { results: [], total: 0 }
  const folded = foldName(query)
  const ranked: { result: HeadphoneResult; rank: number; name: string }[] = []
  for (const result of index) {
    const name = foldName(result.name)
    if (!words.every((word) => name.includes(word))) continue
    const rank =
      name === folded
        ? 0
        : name.startsWith(`${folded} `)
          ? 1
          : words.every((word) => name === word || name.startsWith(`${word} `) || name.includes(` ${word}`))
            ? 2
            : 3
    ranked.push({ result, rank, name })
  }
  ranked.sort((a, b) => a.rank - b.rank || a.name.length - b.name.length || a.name.localeCompare(b.name))
  return { results: ranked.slice(0, limit).map((item) => item.result), total: ranked.length }
}
