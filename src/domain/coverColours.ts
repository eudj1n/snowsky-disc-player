/**
 * Two colours of a cover for the page's backgrounds (owner, 2026-09-30; plan
 * "Album colours"). The average of all pixels made dark or many-coloured
 * covers grey or muddy, so the colours come from buckets of a small copy:
 * near-black, near-white and grey weigh little, the frequent and saturated
 * colour wins, and the second one clearly differs from it. Backgrounds then
 * fit the colours to the theme in OKLCH so the theme's own text stays
 * readable; controls never take them (the owner: they stay stable).
 */

export type Rgb = readonly [number, number, number]

/** OKLCH: lightness 0..1, chroma, hue in radians. */
export interface Lch {
  L: number
  C: number
  h: number
}

export interface CoverColours {
  first: Lch
  second: Lch
  /** The cover has almost no colour: backgrounds stay close to the theme. */
  grey: boolean
}

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

/** sRGB to OKLab (Björn Ottosson). */
export function toOklab([r, g, b]: Rgb): [number, number, number] {
  const R = linear(r / 255)
  const G = linear(g / 255)
  const B = linear(b / 255)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function fromOklab([L, a, b]: readonly [number, number, number]): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const channel = (c: number) => Math.round(Math.min(1, Math.max(0, gamma(c))) * 255)
  return [
    channel(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    channel(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    channel(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

export function toLch(rgb: Rgb): Lch {
  const [L, a, b] = toOklab(rgb)
  return { L, C: Math.hypot(a, b), h: Math.atan2(b, a) }
}

export const fromLch = ({ L, C, h }: Lch): Rgb => fromOklab([L, C * Math.cos(h), C * Math.sin(h)])

export const hex = (rgb: Rgb) => `#${rgb.map((value) => value.toString(16).padStart(2, '0')).join('')}`

/** WCAG contrast ratio of two colours. */
export function contrast(a: Rgb, b: Rgb): number {
  const luminance = (rgb: Rgb) => {
    const [r, g, bl] = rgb.map((value) => linear(value / 255)) as [number, number, number]
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((value, i) => value - (b[i] ?? 0)))

/** The two colours of RGBA pixels (a small copy of the cover: 48×48 is plenty). */
export function coverColours(pixels: ArrayLike<number>): CoverColours {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if ((pixels[i + 3] ?? 0) < 128) continue
    const r = pixels[i] ?? 0
    const g = pixels[i + 1] ?? 0
    const b = pixels[i + 2] ?? 0
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    bucket.n++
    bucket.r += r
    bucket.g += g
    bucket.b += b
    buckets.set(key, bucket)
  }
  const total = [...buckets.values()].reduce((sum, bucket) => sum + bucket.n, 0) || 1
  const colours = [...buckets.values()]
    .map((bucket) => {
      const rgb: Rgb = [bucket.r / bucket.n, bucket.g / bucket.n, bucket.b / bucket.n].map(Math.round) as unknown as Rgb
      const lch = toLch(rgb)
      const plain = lch.C < 0.035 || lch.L < 0.16 || lch.L > 0.94
      return {
        lch,
        lab: toOklab(rgb),
        score: (bucket.n / total) * (0.15 + Math.min(lch.C, 0.25) * 4) * (plain ? 0.08 : 1),
      }
    })
    .sort((a, b) => b.score - a.score)
  // One colour spread over neighbouring buckets counts once.
  const merged: typeof colours = []
  for (const colour of colours) {
    const near = merged.find((kept) => distance(kept.lab, colour.lab) < 0.06)
    if (near) near.score += colour.score
    else merged.push({ ...colour })
  }
  merged.sort((a, b) => b.score - a.score)
  const first = merged[0]?.lch ?? { L: 0.6, C: 0, h: 0 }
  const firstLab = merged[0]?.lab ?? [0.6, 0, 0]
  const other = merged.find((colour) => distance(colour.lab, firstLab) > 0.13)?.lch
  // A cover of one colour: the same hue, lighter and softer, so the gradient still has depth.
  const second = other ?? { L: Math.min(0.9, first.L + 0.14), C: first.C * 0.6, h: first.h + 0.12 }
  return { first, second, grey: first.C < 0.035 }
}

export type Theme = 'light' | 'dark'

/**
 * A background tint that keeps the theme's text readable: light and soft in
 * the light theme, dark in the dark one. `strength` scales its colour.
 */
export function tint(colour: Lch, theme: Theme, strength = 1): Rgb {
  const L =
    theme === 'light' ? Math.min(0.93, Math.max(0.8, colour.L + 0.25)) : Math.min(0.36, Math.max(0.24, colour.L - 0.2))
  return fromLch({ L, C: Math.min(colour.C, theme === 'light' ? 0.11 : 0.09) * strength, h: colour.h })
}

/** A deep version for backgrounds under light text (the Now Playing panel, karaoke). */
export const deep = (colour: Lch, L = 0.3): Rgb => fromLch({ L, C: Math.min(colour.C, 0.13), h: colour.h })
