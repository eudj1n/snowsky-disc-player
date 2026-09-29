import { describe, expect, it } from 'vitest'
import { discGeometry, drawDisc, type DiscFrame } from '../../src/layout/discDrawing'

/** A 2D context that records what is drawn. */
function recorder(): { context: CanvasRenderingContext2D; calls: string[] } {
  const calls: string[] = []
  const gradient = { addColorStop: () => undefined }
  const context = new Proxy<Record<string, unknown>>(
    {},
    {
      get(target, name: string) {
        if (name in target) return target[name]
        if (name === 'createRadialGradient' || name === 'createLinearGradient') return () => gradient
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

const frame = (change: Partial<DiscFrame> = {}): DiscFrame => ({
  width: 1000,
  height: 600,
  levels: [0.9, 0.4, 0.1],
  peaks: [1, 0.5, 0],
  grooves: [0.5, 0.2],
  pulse: 0.5,
  rotation: 0.3,
  cover: null,
  coverSize: null,
  accent: '#f35c3f',
  ...change,
})

describe('the visualizer disc', () => {
  it('keeps the disc, its pulsing ring and the longest spokes clear of the screen edges and the controls', () => {
    for (const [width, height] of [
      [1280, 720],
      [412, 915],
      [3840, 2160],
    ] as const) {
      const { cy, radius, ring, reach } = discGeometry(width, height)
      // The pulsing ring, the gap before the spokes, the longest spoke and its peak mark.
      const outermost = ring * 1.05 + radius * 0.08 + reach + Math.min(width, height) * 0.015
      expect(cy - outermost).toBeGreaterThan(0)
      // The footer's controls take the bottom 84 px (a 58 px button over 26 px).
      expect(cy + outermost).toBeLessThan(height - 84)
      expect(outermost * 2).toBeLessThan(width)
    }
  })

  it('draws two spokes per band, a peak mark per audible peak and a groove per group', () => {
    const { context, calls } = recorder()
    drawDisc(context, frame())
    const count = (name: string) => calls.filter((call) => call.startsWith(`${name}:`)).length
    expect(count('lineTo')).toBe(6)
    // Two peaks are audible, each mirrored; the silent one has no mark.
    expect(calls.filter((call) => call === 'arc:5').length).toBe(4 + 2 + 3)
    expect(count('drawImage')).toBe(0)
  })

  it('draws the cover turned inside the disc when there is one', () => {
    const { context, calls } = recorder()
    drawDisc(context, frame({ cover: {} as CanvasImageSource, coverSize: { width: 400, height: 300 } }))
    expect(calls).toContain('rotate:1')
    expect(calls).toContain('drawImage:5')
  })
})
