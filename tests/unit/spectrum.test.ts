import { describe, expect, it } from 'vitest'
import { bandLevels, fallingPeaks, groupLevels, logBands, loudest, mirroredSpokes } from '../../src/domain/spectrum'

describe('the visualizer spectrum', () => {
  it('spaces bands like hearing: narrow at the bottom, wide at the top, none empty', () => {
    const bands = logBands(1024, 44100, 32)
    expect(bands).toHaveLength(32)
    expect(bands.every((band) => band.to > band.from)).toBe(true)
    // Contiguous and within the analyser.
    for (let i = 1; i < bands.length; i++) expect(bands[i]?.from).toBe(bands[i - 1]?.to)
    expect(bands.at(-1)?.to).toBeLessThanOrEqual(1024)
    const width = (i: number) => (bands[i]?.to ?? 0) - (bands[i]?.from ?? 0)
    expect(width(31)).toBeGreaterThan(width(3))
    // An 8 kHz stream stops at its Nyquist frequency.
    const low = logBands(1024, 8000, 16)
    expect(low.at(-1)?.to).toBeLessThanOrEqual(1024)
  })

  it('takes each band at its loudest bin and eases the level', () => {
    const bins = new Uint8Array(8)
    bins[1] = 255
    bins[5] = 128
    const levels = bandLevels(bins, [
      { from: 0, to: 2 },
      { from: 2, to: 5 },
      { from: 5, to: 8 },
    ])
    expect(levels[0]).toBe(1)
    expect(levels[1]).toBe(0)
    expect(levels[2]).toBeCloseTo(Math.pow(128 / 255, 1.6), 5)
    expect(loudest(levels)).toBe(1)
  })

  it('lifts peak marks at once and lets them fall slowly', () => {
    expect(fallingPeaks([0.2], [0.8], 16)).toEqual([0.8])
    expect(fallingPeaks([0.8], [0.1], 500)[0]).toBeCloseTo(0.35, 5)
    expect(fallingPeaks([0.3], [0.25], 1000)).toEqual([0.25])
  })

  it('mirrors the spokes: the lowest band at the bottom, the highest meeting at the top', () => {
    const spokes = mirroredSpokes([1, 0.5])
    expect(spokes).toHaveLength(4)
    const [lowLeft, lowRight, highLeft, highRight] = spokes
    // Both copies of a band sit symmetrically about the vertical axis.
    expect(Math.cos(lowLeft?.angle ?? 0)).toBeCloseTo(-Math.cos(lowRight?.angle ?? 0))
    expect(Math.sin(lowLeft?.angle ?? 0)).toBeCloseTo(Math.sin(lowRight?.angle ?? 0))
    // The low band is below the middle, the high one above it.
    expect(Math.sin(lowLeft?.angle ?? 0)).toBeGreaterThan(0)
    expect(Math.sin(highRight?.angle ?? 0)).toBeLessThan(0)
    expect(highLeft?.level).toBe(0.5)
  })

  it('averages neighbouring bands into grooves', () => {
    expect(groupLevels([1, 0, 0.5, 0.5, 0.2, 0.4], 3)).toEqual([0.5, 0.5, expect.closeTo(0.3, 5) as number])
    expect(groupLevels([0.4, 0.8], 4)).toHaveLength(4)
    expect(groupLevels([], 3)).toEqual([])
  })
})
