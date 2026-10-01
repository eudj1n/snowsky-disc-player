import { afterEach, describe, expect, it, vi } from 'vitest'
import { coverPlace, pickRelease, rankReleases } from '../../src/domain/covers'
import { CoverUnreachable, frontCover } from '../../src/gateway/coverart'
import { findReleases, phrase, resetPacing } from '../../src/gateway/musicbrainz'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])
const urlOf = (input: RequestInfo | URL) => new URL(input instanceof Request ? input.url : input.toString())

describe('MusicBrainz releases', () => {
  afterEach(() => resetPacing())

  it('searches by the quoted title and artist and reads each release', async () => {
    const asked: URL[] = []
    const fetchImpl = ((input: RequestInfo | URL) => {
      asked.push(urlOf(input))
      return Promise.resolve(
        Response.json({
          releases: [
            {
              id: 'r1',
              score: 100,
              title: 'Night Drive',
              date: '2004-06-01',
              'track-count': 3,
              'artist-credit': [{ name: 'Northline', joinphrase: ' & ', artist: { id: 'a1' } }, { name: 'Kestrel' }],
              'release-group': { id: 'g1', 'primary-type': 'Album' },
              country: 'GB',
              barcode: '5012345678900',
              'label-info': [{ 'catalog-number': 'NL-001', label: { name: 'Lumen Records' } }],
              media: [{ format: 'CD' }, { format: 'CD' }, { format: 'DVD' }],
            },
            { score: 90 },
          ],
        }),
      )
    }) as typeof fetch
    expect(await findReleases('Night Drive', 'Northline', fetchImpl)).toEqual([
      {
        id: 'r1',
        group: 'g1',
        title: 'Night Drive',
        artist: 'Northline & Kestrel',
        date: '2004-06-01',
        trackCount: 3,
        score: 100,
        country: 'GB',
        format: '2×CD + DVD',
        label: 'Lumen Records',
        catalogNumber: 'NL-001',
        barcode: '5012345678900',
        type: 'Album',
        artistId: 'a1',
      },
    ])
    expect(`${asked[0]?.origin ?? ''}${asked[0]?.pathname ?? ''}`).toBe('https://musicbrainz.org/ws/2/release/')
    expect(asked[0]?.searchParams.get('query')).toBe('release:"Night Drive" AND artist:"Northline"')
    expect(asked[0]?.searchParams.get('fmt')).toBe('json')
  })

  it('escapes quotes and backslashes inside a phrase', () => {
    expect(phrase('The "Best" \\ Of')).toBe('"The \\"Best\\" \\\\ Of"')
  })

  it('leaves at least a second between requests', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = (() => Promise.resolve(Response.json({ releases: [] }))) as typeof fetch
      await findReleases('A', 'B', fetchImpl)
      let second = false
      const next = findReleases('C', 'D', fetchImpl).then(() => (second = true))
      await vi.advanceTimersByTimeAsync(1000)
      expect(second).toBe(false)
      await vi.advanceTimersByTimeAsync(200)
      await next
      expect(second).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Cover Art Archive front covers', () => {
  it("takes the release's cover, else its release group's, checked as an image", async () => {
    const asked: string[] = []
    const fetchImpl = ((input: RequestInfo | URL) => {
      const url = urlOf(input)
      asked.push(url.pathname)
      return Promise.resolve(
        url.pathname.startsWith('/release-group/') ? new Response(JPEG) : new Response('none', { status: 404 }),
      )
    }) as typeof fetch
    const cover = await frontCover({ id: 'r1', group: 'g1' }, fetchImpl)
    expect(cover?.type).toBe('image/jpeg')
    expect(asked).toEqual(['/release/r1/front-500', '/release-group/g1/front-500'])
    const text = (() => Promise.resolve(new Response('<html>'))) as typeof fetch
    expect(await frontCover({ id: 'r1', group: null }, text)).toBeNull()
  })

  it('says when its image hosts cannot be reached', async () => {
    const offline = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch
    await expect(frontCover({ id: 'r1', group: null }, offline)).rejects.toBeInstanceOf(CoverUnreachable)
  })
})

describe('choosing a release and the place of its cover', () => {
  it('offers a well-scored release, preferring the album length', () => {
    const candidates = [
      { id: 'a', score: 100, trackCount: 12 },
      { id: 'b', score: 95, trackCount: 3 },
      { id: 'c', score: 60, trackCount: 3 },
    ]
    expect(pickRelease(candidates, 3)?.id).toBe('b')
    expect(pickRelease(candidates, 7)?.id).toBe('a')
    expect(pickRelease([{ id: 'c', score: 60, trackCount: 3 }], 3)).toBeNull()
  })

  it('offers well-scored editions for the choice, those of the album length first, at most twelve', () => {
    const candidates = [
      { id: 'a', score: 100, trackCount: 12 },
      { id: 'b', score: 90, trackCount: 3 },
      { id: 'c', score: 60, trackCount: 3 },
      { id: 'd', score: 95, trackCount: 3 },
    ]
    expect(rankReleases(candidates, 3).map((release) => release.id)).toEqual(['d', 'b', 'a'])
    expect(rankReleases(candidates, null).map((release) => release.id)).toEqual(['a', 'd', 'b'])
    const many = Array.from({ length: 20 }, (_, n) => ({ id: String(n), score: 99, trackCount: 3 }))
    expect(rankReleases(many, 3)).toHaveLength(12)
  })

  it('puts a cover only into a folder that holds the album alone', () => {
    const album = [
      { path: '/tmp/sdcard/Northline - Night Drive/a.flac', album: 'Night Drive' },
      { path: '/tmp/sdcard/Northline - Night Drive/b.flac', album: 'Night Drive' },
    ]
    const other = { path: '/tmp/sdcard/Mixed/c.flac', album: 'Other' }
    expect(coverPlace(album, [...album, other])).toEqual({ folder: 'Northline - Night Drive' })
    expect(coverPlace(album, [...album, { ...other, path: '/tmp/sdcard/Northline - Night Drive/c.flac' }])).toEqual({
      refused: 'shared',
    })
    expect(coverPlace([...album, { path: '/tmp/sdcard/CD2/d.flac', album: 'Night Drive' }], album)).toEqual({
      refused: 'folders',
    })
    expect(coverPlace([{ path: '/tmp/sdcard/a.flac', album: 'Loose' }], [])).toEqual({ refused: 'outside' })
  })
})
