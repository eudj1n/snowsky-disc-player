import { describe, expect, it } from 'vitest'
import type { ServicePlay } from '../../src/domain/history'
import { libraryRow, trackFacts } from '../../src/domain/nowFacts'
import type { LibraryTrack } from '../../src/domain/track'

const row = (change: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: 7,
  title: 'Undertow',
  artist: 'Lumen;Kestrel',
  album: 'Tide Tables',
  queuePosition: null,
  path: '/tmp/sdcard/Lumen - Tide Tables/CD1/a Undertow.flac',
  durationMs: 25_000,
  fileName: 'a Undertow.flac',
  albumArtist: 'Lumen',
  genre: 'Ambient',
  discNumber: 1,
  trackNumber: 1,
  addedAt: 1_790_000_000,
  ...change,
})
const play = (path: string, at: number, title: string | null = null): ServicePlay => ({
  path,
  title,
  at,
  seconds: 20,
  context: { type: 3, count: 4, hash: null, album: null, artist: null, genre: null, folder: null },
})

describe('the Now tab facts', () => {
  it('gathers the library row, the measured file and the plays of the track', () => {
    const track = row()
    const facts = trackFacts({
      track: { ...track, bitRate: 1411 },
      library: track,
      file: { bytes: 4_400_000, format: 'flac', sampleRate: 44_100, bitDepth: 16, bitRate: 1400, channels: 2 },
      year: 2004,
      plays: [play(track.path ?? '', 100), play('/tmp/sdcard/other.flac', 150), play(track.path ?? '', 200)],
    })
    expect(facts).toEqual({
      bitRate: 1411,
      channels: 2,
      year: 2004,
      genre: 'Ambient',
      disc: 1,
      trackNumber: 1,
      // A guest's joint credit differs from the album artist, so it is named.
      albumArtist: 'Lumen',
      bytes: 4_400_000,
      folder: '/tmp/sdcard/Lumen - Tide Tables/CD1',
      plays: 2,
      lastPlayedAt: 200,
      addedAt: 1_790_000_000,
    })
  })

  it("leaves out what is unknown, stock's placeholders and an album artist equal to the credit", () => {
    const track = row({ genre: 'Unknown genre', albumArtist: 'Kestrel; Lumen', discNumber: 0, trackNumber: null })
    const facts = trackFacts({ track, library: track, file: null, year: null, plays: [] })
    expect(facts.genre).toBeNull()
    expect(facts.albumArtist).toBeNull()
    expect(facts.disc).toBeNull()
    expect(facts.trackNumber).toBeNull()
    expect(facts.bytes).toBeNull()
    expect(facts.plays).toBe(0)
    expect(facts.lastPlayedAt).toBeNull()
  })

  it('counts a CUE track by its title and finds its own library row', () => {
    const image = '/tmp/sdcard/Image Sessions/Image Sessions.flac'
    const first = row({ title: 'First Frame', path: image, cue: true, id: 1 })
    const second = row({ title: 'Second Frame', path: image, cue: true, id: 2 })
    expect(libraryRow([first, second], { ...second, id: undefined } as never)?.id).toBe(2)
    const facts = trackFacts({
      track: second,
      library: second,
      file: null,
      year: null,
      plays: [play(image, 10, 'First Frame'), play(image, 20, 'Second Frame')],
    })
    expect(facts.plays).toBe(1)
    expect(libraryRow([first], null)).toBeNull()
  })
})
