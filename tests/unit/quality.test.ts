import { describe, expect, it } from 'vitest'
import { isHiRes, qualityLabel, type AudioQuality } from '../../src/domain/quality'

const q = (over: Partial<AudioQuality>): AudioQuality => ({
  format: 'FLAC',
  sampleRate: null,
  bitDepth: null,
  bitRate: null,
  dsd: false,
  ...over,
})

describe('audio quality', () => {
  it('labels lossless by bits and kHz, lossy by kbps and DSD by its rate', () => {
    expect(qualityLabel(q({ sampleRate: 96_000, bitDepth: 24 }))).toBe('24/96')
    expect(qualityLabel(q({ sampleRate: 44_100, bitDepth: 16 }))).toBe('16/44.1')
    expect(qualityLabel(q({ format: 'MP3', sampleRate: 44_100, bitDepth: 16, bitRate: 320 }))).toBe('320 kbps')
    expect(qualityLabel(q({ format: 'DSF', sampleRate: 2_822_400, dsd: true }))).toBe('DSD64')
    expect(qualityLabel(q({}))).toBeNull()
  })

  it('calls more than CD quality Hi-Res', () => {
    expect(isHiRes(q({ sampleRate: 96_000, bitDepth: 24 }))).toBe(true)
    expect(isHiRes(q({ sampleRate: 48_000, bitDepth: 24 }))).toBe(true)
    expect(isHiRes(q({ sampleRate: 44_100, bitDepth: 16 }))).toBe(false)
    expect(isHiRes(q({ format: 'DSF', dsd: true }))).toBe(true)
  })
})
