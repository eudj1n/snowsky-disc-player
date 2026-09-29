import { describe, expect, it } from 'vitest'
import { featuredChoice, stockUnknown, type Album, type CoverState } from '../../src/domain/album'

const album = (title: string, artist: string): Album => ({
  key: title,
  title,
  artists: [artist],
  trackArtists: [artist],
  paths: {},
  trackCount: 1,
  genres: [],
  ids: [],
  addedAt: null,
})

describe('the Home hero', () => {
  const albums = [
    album('Unknown album', 'Unknown Artist'),
    album('Loose Tracks', 'unknown artist'),
    album('Blue Hours', 'Mira Sol'),
    album('Harbor', 'Kestrel'),
    album('Night Lines', 'Lumen'),
  ]
  const covers: Record<string, CoverState> = { 'Blue Hours': 'found', Harbor: 'missing', 'Night Lines': 'unknown' }
  const cover = (item: Album) => covers[item.key] ?? 'unknown'

  it("knows stock's placeholder names, whatever their case", () => {
    expect(stockUnknown('Unknown Artist')).toBe(true)
    expect(stockUnknown(' unknown album ')).toBe(true)
    expect(stockUnknown(null)).toBe(true)
    expect(stockUnknown('Unknown Pleasures')).toBe(false)
  })

  it('offers only named albums with a cover while any is known', () => {
    for (const seed of [0, 0.3, 0.6, 0.99]) expect(featuredChoice(albums, cover, seed, null)?.title).toBe('Blue Hours')
  })

  it('falls back to named albums not yet asked for a cover, never a missing one', () => {
    const none = () => 'unknown' as const
    const titles = [0, 0.3, 0.6, 0.99].map((seed) => featuredChoice(albums.slice(0, 4), none, seed, null)?.title)
    expect(new Set(titles)).toEqual(new Set(['Blue Hours', 'Harbor']))
    expect(featuredChoice(albums.slice(0, 4), cover, 0.99, null)?.title).toBe('Blue Hours')
  })

  it('keeps its choice while it qualifies, so arriving covers do not change it', () => {
    expect(featuredChoice(albums, cover, 0, 'Night Lines')?.title).toBe('Night Lines')
    // Known to have no cover after all: another one takes its place.
    expect(featuredChoice(albums, cover, 0, 'Harbor')?.title).toBe('Blue Hours')
  })
})
