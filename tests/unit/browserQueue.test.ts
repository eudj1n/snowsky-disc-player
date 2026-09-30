import { describe, expect, it } from 'vitest'
import { browserType, nextIndex, playableIn, previousIndex } from '../../src/domain/browserQueue'

describe('the queue this browser plays', () => {
  it('knows the files a browser can decode by their names', () => {
    expect(browserType('/tmp/sdcard/A/01.flac')).toBe('audio/flac')
    expect(browserType('/tmp/sdcard/A/01.MP3')).toBe('audio/mpeg')
    expect(browserType('/tmp/sdcard/A/01.ape')).toBeNull()
    expect(browserType('/tmp/sdcard/A/01.dsf')).toBeNull()
    expect(browserType('/tmp/sdcard/A/noext')).toBeNull()
    const chrome = (type: string) => (type === 'audio/aiff' ? '' : 'maybe')
    expect(playableIn('/a/01.flac', chrome)).toBe(true)
    expect(playableIn('/a/01.aiff', chrome)).toBe(false)
    expect(playableIn('/a/01.wv', chrome)).toBe(false)
    expect(playableIn(null, chrome)).toBe(false)
  })

  it('moves on, repeats one track or the queue, and skips what cannot play', () => {
    const all = () => true
    expect(nextIndex(3, 0, 'off', all)).toBe(1)
    expect(nextIndex(3, 2, 'off', all)).toBeNull()
    expect(nextIndex(3, 2, 'all', all)).toBe(0)
    expect(nextIndex(3, 1, 'one', all)).toBe(1)
    expect(nextIndex(3, 1, 'one', all, true)).toBe(2)
    const second = (index: number) => index !== 1
    expect(nextIndex(3, 0, 'off', second)).toBe(2)
    expect(nextIndex(3, 2, 'all', (index) => index === 2)).toBe(2)
    expect(nextIndex(3, 0, 'off', () => false)).toBeNull()
    expect(previousIndex(3, 1, 'off', all)).toBe(0)
    expect(previousIndex(3, 0, 'off', all)).toBeNull()
    expect(previousIndex(3, 0, 'all', all)).toBe(2)
    expect(previousIndex(3, 2, 'off', second)).toBe(0)
  })
})
