import { describe, expect, it } from 'vitest'
import {
  activeLine,
  dotsProgress,
  karaokeRange,
  lineProgress,
  nextLineMs,
  parseLyrics,
  pauseDots,
  silentLine,
  wordProgress,
} from '../../src/domain/lyrics'
import { decodeLyrics, mediaPath } from '../../src/gateway/media'

describe('lyrics', () => {
  it('parses LRC with several stamps per line, an offset and metadata tags', () => {
    const lyrics = parseLyrics('[ar:Lumen]\n[offset:500]\n[00:10.00][00:30.50]Chorus\n[00:05.2]Verse <00:06.00>one\n')
    expect(lyrics.synced).toBe(true)
    expect(lyrics.lines).toEqual([
      {
        timeMs: 4700,
        text: 'Verse one',
        // Word stamps shift with the offset too.
        words: [
          { timeMs: 4700, text: 'Verse ' },
          { timeMs: 5500, text: 'one' },
        ],
      },
      { timeMs: 9500, text: 'Chorus' },
      { timeMs: 30000, text: 'Chorus' },
    ])
    expect(activeLine(lyrics, 9600)).toBe(1)
    expect(activeLine(lyrics, 100)).toBe(-1)
  })

  it('keeps the word timings of enhanced LRC, syllables and a closing stamp included', () => {
    const lyrics = parseLyrics(
      '[00:12.00]<00:12.00>Hello <00:12.50>wide <00:13.10>world<00:14.00>\n' +
        '[00:15.00]Kar<00:15.40>a<00:15.60>o<00:15.80>ke\n' +
        '[00:20.00][00:40.00]<00:20.00>Sing <00:20.80>again\n' +
        '[00:25.00]No word stamps here\n',
    )
    const [hello, karaoke, first, plain, second] = lyrics.lines
    expect(hello).toEqual({
      timeMs: 12000,
      text: 'Hello wide world',
      words: [
        { timeMs: 12000, text: 'Hello ' },
        { timeMs: 12500, text: 'wide ' },
        { timeMs: 13100, text: 'world' },
      ],
      endMs: 14000,
    })
    // Text before the first word stamp starts with the line; syllables join without spaces.
    expect(karaoke?.text).toBe('Karaoke')
    expect(karaoke?.words?.map((word) => [word.timeMs, word.text])).toEqual([
      [15000, 'Kar'],
      [15400, 'a'],
      [15600, 'o'],
      [15800, 'ke'],
    ])
    expect(karaoke?.endMs).toBeUndefined()
    // A repeated line sings its words the same way each time.
    expect(first?.words?.map((word) => word.timeMs)).toEqual([20000, 20800])
    expect(second?.timeMs).toBe(40000)
    expect(second?.words?.map((word) => word.timeMs)).toEqual([40000, 40800])
    expect(plain).toEqual({ timeMs: 25000, text: 'No word stamps here' })
  })

  it('sweeps a line by its words, or by its time to the next line', () => {
    const [hello, , , plain] = parseLyrics(
      '[00:12.00]<00:12.00>Hello <00:12.50>wide <00:13.10>world<00:14.00>\n' +
        '[00:15.00]Kar<00:15.40>a<00:15.60>o<00:15.80>ke\n' +
        '[00:20.00]<00:20.00>Sing <00:20.80>again\n' +
        '[00:25.00]No word stamps here\n',
    ).lines
    if (!hello || !plain) throw new Error('parsed lines')
    expect(wordProgress(hello, 15000, 12250)).toEqual([0.5, 0, 0])
    expect(wordProgress(hello, 15000, 13550)).toEqual([1, 1, 0.5])
    expect(wordProgress(hello, 15000, 20000)).toEqual([1, 1, 1])
    expect(wordProgress(hello, 15000, null)).toEqual([0, 0, 0])
    // A last word without a closing stamp lasts until the next line, at most 1.5 s.
    const karaoke = parseLyrics('[00:15.00]Kar<00:15.40>a<00:15.60>o<00:15.80>ke').lines[0]
    if (!karaoke) throw new Error('parsed line')
    expect(wordProgress(karaoke, 30000, 16550).at(-1)).toBe(0.5)
    expect(wordProgress(karaoke, 16300, 16050).at(-1)).toBe(0.5)
    expect(lineProgress(plain, 29000, 27000)).toBe(0.5)
    // A long pause after the line: the sweep takes at most 10 s.
    expect(lineProgress(plain, null, 30000)).toBe(0.5)
    expect(lineProgress(plain, 29000, 24000)).toBe(0)
    expect(lineProgress({ timeMs: null, text: '' }, null, 1)).toBe(0)
  })

  it('measures a pause to the next line in full and fills three dots in turn', () => {
    const pause = { timeMs: 10_000, text: '' }
    // A sung line sweeps over at most 10 s; a pause runs to the next line.
    expect(lineProgress(pause, 40_000, 25_000)).toBe(1)
    expect(lineProgress(pause, 40_000, 25_000, Infinity)).toBe(0.5)
    expect(silentLine({ text: '' })).toBe(true)
    expect(silentLine({ text: ' ♪ ♪ ' })).toBe(true)
    expect(silentLine({ text: '...' })).toBe(true)
    expect(silentLine({ text: 'Oh…' })).toBe(false)
    expect(dotsProgress(0)).toEqual([0, 0, 0])
    expect(dotsProgress(0.5)).toEqual([1, 0.5, 0])
    expect(dotsProgress(1)).toEqual([1, 1, 1])
  })

  it('fills the current pause to the next timed line and leaves sung lines without dots', () => {
    const lines = [
      { timeMs: 0, text: 'Sung' },
      { timeMs: 3000, text: '♪' },
      { timeMs: null, text: 'Untimed' },
      { timeMs: 9000, text: 'Next' },
    ]
    // The untimed line is skipped: the pause runs from 3 s to 9 s.
    expect(nextLineMs(lines, 1)).toBe(9000)
    expect(nextLineMs(lines, 3)).toBeNull()
    expect(pauseDots(lines, 1, 6000)).toEqual([1, 0.5, 0])
    expect(pauseDots(lines, 0, 1000)).toBeNull()
    expect(pauseDots(lines, -1, 0)).toBeNull()
  })

  it('shows two sung lines, the current one and four to come', () => {
    expect(karaokeRange(40, 10)).toEqual({ from: 8, to: 14, center: 10 })
    expect(karaokeRange(40, -1)).toEqual({ from: 0, to: 4, center: 0 })
    expect(karaokeRange(12, 11)).toEqual({ from: 9, to: 11, center: 11 })
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
