import { describe, expect, it } from 'vitest'
import { dotCount, hueOf, spokeHue, waveRing } from '../../src/domain/spectrum'
import { drawVinyl, MAX_DOTS, vinylGeometry, type VinylFrame } from '../../src/layout/vinylDrawing'

/** A 2D context that records what is drawn. */
function recorder(): { context: CanvasRenderingContext2D; calls: string[] } {
  const calls: string[] = []
  const gradient = { addColorStop: () => undefined }
  const context = new Proxy<Record<string, unknown>>(
    {},
    {
      get(target, name: string) {
        if (name in target) return target[name]
        if (name.startsWith('create')) return () => gradient
        return (...args: unknown[]) => calls.push(`${name}:${String(args.length)}`)
      },
      set(target, name: string, value) {
        target[name] = value
        return true
      },
    },
  )
  return { context: context as unknown as CanvasRenderingContext2D, calls }
}

const frame = (change: Partial<VinylFrame> = {}): VinylFrame => ({
  width: 1280,
  height: 720,
  levels: [1, 0.5, 0],
  peaks: [1, 0.5, 0],
  grooves: [0.4, 0.1],
  wave: [0, 0.5, -0.5, 0],
  pulse: 0.5,
  rotation: 0.3,
  seconds: 2,
  cover: null,
  coverSize: null,
  hue: 12,
  accent: '#f35c3f',
  ...change,
})

describe('the vinyl visualizer', () => {
  it('keeps the record, its breathing and the tallest spokes clear of the edges and the controls', () => {
    for (const [width, height] of [
      [1280, 720],
      [412, 915],
      [3840, 2160],
    ] as const) {
      const { cy, disc, ringStart, reach } = vinylGeometry(width, height)
      const outermost = ringStart * 1.03 + reach + Math.min(width, height) * 0.02
      expect(cy - outermost, `${String(width)}×${String(height)}`).toBeGreaterThan(0)
      expect(cy + outermost).toBeLessThan(height - 84)
      expect(outermost * 2).toBeLessThan(width)
      expect(ringStart).toBeGreaterThan(disc)
    }
  })

  it('rises one to nine dots per spoke and colours them round from the cover hue', () => {
    expect(dotCount(0, MAX_DOTS)).toBe(1)
    expect(dotCount(1, MAX_DOTS)).toBe(MAX_DOTS)
    expect(dotCount(0.5, MAX_DOTS)).toBe(5)
    expect(spokeHue(12, 0, 96, 0)).toBe(12)
    // Mirrored: a spoke and its twin share a colour; the sweep drifts with time.
    expect(spokeHue(12, 3, 96, 0)).toBe(spokeHue(12, 51, 96, 0))
    expect(spokeHue(12, 0, 96, 10)).toBe(72)
  })

  it('reads a hue from a colour and a waveform from the analyser bytes', () => {
    expect(hueOf(255, 0, 0)).toBe(0)
    expect(Math.round(hueOf(0, 0, 255))).toBe(240)
    expect(hueOf(120, 120, 120, 12)).toBe(12)
    expect(waveRing([128, 255, 0, 128], 4)).toEqual([0, 127 / 128, -1, 0])
    expect(waveRing([], 3)).toEqual([0, 0, 0])
  })

  it('draws the label from the cover, turned, and the waveform along the edge', () => {
    const { context, calls } = recorder()
    drawVinyl(context, frame({ cover: {} as CanvasImageSource, coverSize: { width: 400, height: 300 } }))
    expect(calls).toContain('rotate:1')
    expect(calls).toContain('drawImage:5')
    expect(calls.filter((call) => call === 'lineTo:2')).toHaveLength(3)
    const plain = recorder()
    drawVinyl(plain.context, frame())
    expect(plain.calls).not.toContain('drawImage:5')
  })
})
