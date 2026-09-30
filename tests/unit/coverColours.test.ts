import { describe, expect, it } from 'vitest'
import { contrast, coverColours, deep, fromLch, tint, toLch, type Rgb } from '../../src/domain/coverColours'

/** RGBA pixels made of colours in the given shares of a 48×48 cover. */
function cover(parts: readonly [Rgb, number][]): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(48 * 48 * 4)
  let at = 0
  for (const [rgb, share] of parts)
    for (let n = Math.round(share * 48 * 48); n > 0 && at < pixels.length; n--, at += 4) pixels.set([...rgb, 255], at)
  return pixels
}
const degrees = (radians: number) => ((((radians * 180) / Math.PI) % 360) + 360) % 360

describe('cover colours', () => {
  it('find the bright spot of a dark cover instead of its muddy average', () => {
    const colours = coverColours(
      cover([
        [[16, 19, 29], 0.8],
        [[240, 138, 36], 0.15],
        [[232, 226, 214], 0.05],
      ]),
    )
    expect(colours.grey).toBe(false)
    expect(degrees(colours.first.h)).toBeGreaterThan(40)
    expect(degrees(colours.first.h)).toBeLessThan(80)
    expect(colours.first.C).toBeGreaterThan(0.1)
  })

  it('take a second colour that clearly differs from the first', () => {
    const colours = coverColours(
      cover([
        [[200, 40, 50], 0.5],
        [[40, 70, 190], 0.4],
        [[230, 230, 230], 0.1],
      ]),
    )
    const hues = [degrees(colours.first.h), degrees(colours.second.h)].sort((a, b) => a - b)
    expect((hues[1] ?? 0) - (hues[0] ?? 0)).toBeGreaterThan(60)
  })

  it('know a cover with almost no colour', () => {
    expect(
      coverColours(
        cover([
          [[40, 40, 40], 0.5],
          [[190, 190, 190], 0.5],
        ]),
      ).grey,
    ).toBe(true)
  })

  it('fit any hue to the theme so that its own text keeps 4.5:1, and deep colours carry white text', () => {
    for (let hue = 0; hue < 360; hue += 30) {
      const colour = { L: 0.6, C: 0.2, h: (hue * Math.PI) / 180 }
      expect(contrast(tint(colour, 'light'), [36, 37, 33]), `light ${hue}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(tint(colour, 'dark'), [236, 232, 227]), `dark ${hue}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(deep(colour, 0.34), [255, 255, 255]), `deep ${hue}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('convert between sRGB and OKLCH without drift', () => {
    for (const rgb of [
      [240, 138, 36],
      [16, 19, 29],
      [102, 104, 97],
    ] as Rgb[])
      expect(fromLch(toLch(rgb))).toEqual(rgb)
  })
})
