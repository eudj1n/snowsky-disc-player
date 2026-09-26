import { describe, expect, it } from 'vitest'
import { activeLine, parseLyrics } from '../../src/domain/lyrics'
import { decodeLyrics, mediaPath } from '../../src/gateway/media'

describe('lyrics', () => {
  it('parses LRC with several stamps per line, an offset and metadata tags', () => {
    const lyrics = parseLyrics('[ar:Lumen]\n[offset:500]\n[00:10.00][00:30.50]Chorus\n[00:05.2]Verse <00:06.00>one\n')
    expect(lyrics.synced).toBe(true)
    expect(lyrics.lines).toEqual([
      { timeMs: 4700, text: 'Verse one' },
      { timeMs: 9500, text: 'Chorus' },
      { timeMs: 30000, text: 'Chorus' },
    ])
    expect(activeLine(lyrics, 9600)).toBe(1)
    expect(activeLine(lyrics, 100)).toBe(-1)
  })

  it('keeps plain lyrics as text without leading and trailing blank lines', () => {
    const lyrics = parseLyrics('\n\nFirst line\n\nSecond line\n\n')
    expect(lyrics).toEqual({
      synced: false,
      lines: [
        { timeMs: null, text: 'First line' },
        { timeMs: null, text: '' },
        { timeMs: null, text: 'Second line' },
      ],
    })
    expect(activeLine(lyrics, 5000)).toBe(-1)
  })

  it('decodes UTF-8 (with or without BOM) and falls back to Windows-1251', () => {
    expect(decodeLyrics(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Ёж')]))).toBe('Ёж')
    expect(decodeLyrics(new Uint8Array([0xa8, 0xe6]))).toBe('Ёж')
  })

  it('encodes each card path component for the media routes', () => {
    expect(mediaPath('/tmp/sdcard/Ёж Album/01 #1 100%.flac')).toBe(
      '/tmp/sdcard/%D0%81%D0%B6%20Album/01%20%231%20100%25.flac',
    )
  })
})

describe('position between ticks', () => {
  it('adds the time since the last tick while playing, within a bound', async () => {
    const { livePosition, MAX_EXTRAPOLATION_MS } = await import('../../src/domain/lyrics')
    expect(livePosition(10_000, 1_000, 1_400, true)).toBe(10_400)
    expect(livePosition(10_000, 1_000, 1_400, false)).toBe(10_000)
    expect(livePosition(10_000, 1_000, 9_000, true)).toBe(10_000 + MAX_EXTRAPOLATION_MS)
    expect(livePosition(10_000, 1_000, 900, true)).toBe(10_000)
    expect(livePosition(null, 1_000, 1_400, true)).toBeNull()
    expect(livePosition(10_000, null, 1_400, true)).toBe(10_000)
  })
})
