/**
 * AutoEq (https://github.com/jaakkopasanen/AutoEq), the headphone corrections
 * the owner may put on the player's equalizer (owner, 2026-10-20; the
 * analysis is docs/autoeq.md). Its results are read from jsDelivr at one
 * pinned revision of the repository, which the release's reviewed origins
 * admit; the pin moves by hand with a release. Two plain GETs without a
 * CORS preflight, each on a click: the recommended results index
 * (`results/README.md`, one result per headphone model) and the chosen
 * model's `FixedBandEQ.txt` (ten peaking filters on octave frequencies, the
 * DISC's ten bands one to one). Nothing of the owner's leaves the network.
 */
import { AUTOEQ_REVISION, BANDS, FORMS, type Correction, type HeadphoneResult } from '../domain/autoeq'
import type { PeqBand } from '../domain/eq'

const BASE = `https://cdn.jsdelivr.net/gh/jaakkopasanen/AutoEq@${AUTOEQ_REVISION}/results/`
const TIMEOUT_MS = 15_000

const LINK = /^- \[(.+)\]\(\.\/(.+)\)$/

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}

/** The headphones of `results/README.md`, in its order; lines that are not a result link are skipped. */
export function parseRecommended(markdown: string): HeadphoneResult[] {
  const results: HeadphoneResult[] = []
  for (const line of markdown.split('\n')) {
    const match = LINK.exec(line.trimEnd())
    if (!match) continue
    const segments = (match[2] ?? '').split('/').map(decode)
    if (segments.length !== 3 || segments.some((segment) => segment === null || segment === '')) continue
    const [source, rigForm] = segments as [string, string, string]
    const form = FORMS.find((item) => rigForm === item || rigForm.endsWith(` ${item}`))
    if (!form) continue
    const rig = rigForm === form ? null : rigForm.slice(0, -form.length - 1)
    results.push({ name: (match[1] ?? '').trim(), source, rig, form, path: segments.join('/') })
  }
  return results
}

/** The URL of a result's file, each segment encoded (jsDelivr takes `%26`, `%2B` and UTF-8 alike). */
export function resultUrl(result: Pick<HeadphoneResult, 'path' | 'name'>, file: 'FixedBandEQ.txt'): string {
  return BASE + [...result.path.split('/'), `${result.name} ${file}`].map(encodeURIComponent).join('/')
}

const PREAMP = /^Preamp:\s*(-?\d+(?:\.\d+)?)\s*dB\s*$/
const FILTER = /^Filter\s+(\d+):\s+ON\s+PK\s+Fc\s+(\d+)\s+Hz\s+Gain\s+(-?\d+(?:\.\d+)?)\s+dB\s+Q\s+(\d+(?:\.\d+)?)\s*$/

/** A `FixedBandEQ.txt`: its preamp and ten peaking filters, or a SyntaxError where it is anything else. */
export function parseFixedBand(text: string): Correction {
  let preamp: number | null = null
  const bands: PeqBand[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '') continue
    const head = PREAMP.exec(line)
    if (head) {
      preamp = Number(head[1])
      continue
    }
    const filter = FILTER.exec(line)
    if (!filter) throw new SyntaxError(`Not a fixed band filter: ${line}`)
    const position = Number(filter[1]) - 1
    if (position !== bands.length) throw new SyntaxError('Filters are out of order')
    bands.push({
      position,
      frequency: Number(filter[2]),
      gain: Math.round(Number(filter[3]) * 10) / 10,
      q: Math.round(Number(filter[4]) * 100) / 100,
    })
  }
  if (preamp === null) throw new SyntaxError('No preamp')
  if (bands.length !== BANDS) throw new SyntaxError(`${String(bands.length)} filters, not ${String(BANDS)}`)
  return { preamp: Math.round(preamp * 10) / 10, bands }
}

async function getText(fetchImpl: typeof fetch, url: string): Promise<string> {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), credentials: 'omit' })
  if (!response.ok) throw new Error(`jsDelivr answered ${String(response.status)}`)
  return response.text()
}

/** The recommended index. Throws when jsDelivr cannot be reached. */
export async function fetchRecommended(fetchImpl: typeof fetch = fetch): Promise<HeadphoneResult[]> {
  return parseRecommended(await getText(fetchImpl, `${BASE}README.md`))
}

/** A headphone's fixed band correction. Throws when it cannot be read or is not one. */
export async function fetchCorrection(result: HeadphoneResult, fetchImpl: typeof fetch = fetch): Promise<Correction> {
  return parseFixedBand(await getText(fetchImpl, resultUrl(result, 'FixedBandEQ.txt')))
}
