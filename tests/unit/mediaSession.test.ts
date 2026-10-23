import { describe, expect, it } from 'vitest'
import { documentTitleLine, positionDrifted, sessionMetadata, type PositionMark } from '../../src/domain/mediaSession'

const track = {
  title: 'Orbit',
  artist: 'Forma; Lumi Vale',
  album: 'Inner Space',
  path: '/a.flac',
  durationMs: 180_000,
  queuePosition: null,
}
const mark = (over: Partial<PositionMark> = {}): PositionMark => ({
  key: 'a',
  durationMs: 180_000,
  positionMs: 10_000,
  playing: true,
  at: 1000,
  ...over,
})

describe('media session', () => {
  it("names the tab's title by the track, the title first, the credit as shown", () => {
    expect(documentTitleLine(track)).toBe('Orbit · Forma & Lumi Vale')
    expect(documentTitleLine({ ...track, artist: null })).toBe('Orbit')
    expect(documentTitleLine(null)).toBeNull()
  })

  it('describes the track with its credit as shown and the cover when there is one', () => {
    expect(sessionMetadata(track, { src: 'blob:x', type: 'image/jpeg' })).toEqual({
      title: 'Orbit',
      artist: 'Forma & Lumi Vale',
      album: 'Inner Space',
      artwork: [{ src: 'blob:x', type: 'image/jpeg' }],
    })
    expect(sessionMetadata({ ...track, artist: null, album: null }, null)).toEqual({
      title: 'Orbit',
      artist: '',
      album: '',
      artwork: [],
    })
    expect(sessionMetadata(null, null)).toBeNull()
  })

  it('tells the position again on a new track, a pause, a seek, but not during steady playback', () => {
    expect(positionDrifted(null, mark())).toBe(true)
    // Five seconds on, five seconds further: as expected.
    expect(positionDrifted(mark(), mark({ positionMs: 15_000, at: 6000 }))).toBe(false)
    // Paused: the position stays.
    expect(positionDrifted(mark({ playing: false }), mark({ playing: false, at: 6000 }))).toBe(false)
    expect(positionDrifted(mark(), mark({ playing: false }))).toBe(true)
    expect(positionDrifted(mark(), mark({ key: 'b' }))).toBe(true)
    expect(positionDrifted(mark({ durationMs: null }), mark())).toBe(true)
    // A seek: far from where playback would have advanced to.
    expect(positionDrifted(mark(), mark({ positionMs: 60_000, at: 6000 }))).toBe(true)
  })
})
