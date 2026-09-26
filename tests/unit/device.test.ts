import { describe, expect, it } from 'vitest'
import { formatBytes, formatRate, parseDeviceFacts, resampled } from '../../src/domain/device'

describe('device facts (next image)', () => {
  it('keeps what is well formed and drops the rest', () => {
    const facts = parseDeviceFacts({
      battery: { capacity: 87, voltageMv: 4012, temperatureC: 30.5, cycles: 12 },
      card: { totalBytes: 64_000_000_000, freeBytes: 18_400_000_000 },
      output: { active: true, device: 'pcm3p', state: 'running', format: 'S32_LE', rate: 48000, channels: 2 },
    })
    expect(facts.battery).toEqual({ capacity: 87, voltageMv: 4012, temperatureC: 30.5, cycles: 12 })
    expect(facts.output).toMatchObject({ active: true, rate: 48000, format: 'S32_LE' })
    expect(
      parseDeviceFacts({ battery: { capacity: 140 }, card: { totalBytes: 1, freeBytes: 2 }, output: null }),
    ).toEqual({
      battery: null,
      card: null,
      output: null,
    })
    expect(parseDeviceFacts('nonsense')).toEqual({ battery: null, card: null, output: null })
  })

  it('names sizes and rates, and tells a resampled output', () => {
    expect(formatBytes(18_400_000_000, 'en')).toBe('18 GB')
    expect(formatBytes(1_500_000_000, 'en')).toBe('1.5 GB')
    expect(formatBytes(860_000_000, 'ru')).toBe('860 MB')
    expect(formatRate(44100)).toBe('44.1 kHz')
    expect(formatRate(48000)).toBe('48 kHz')
    const output = { active: true, device: 'pcm3p', format: 'S32_LE', rate: 48000, channels: 2 }
    expect(resampled(output, 44100)).toBe(true)
    expect(resampled(output, 48000)).toBe(false)
    expect(resampled({ ...output, active: false }, 44100)).toBe(false)
    expect(resampled(output, null)).toBe(false)
  })
})
