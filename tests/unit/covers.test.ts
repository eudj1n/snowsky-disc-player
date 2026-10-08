import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  coverPlace,
  editionWords,
  pickRelease,
  rankReleases,
  titleVariants,
  titleWithoutEdition,
} from '../../src/domain/covers'
import { CoverUnreachable, frontCover } from '../../src/gateway/coverart'
import {
  artistReleaseGroups,
  findReleases,
  groupReleases,
  phrase,
  releaseTracks,
  resetPacing,
} from '../../src/gateway/musicbrainz'

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
              disambiguation: 'International Special Edition',
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
        disambiguation: 'International Special Edition',
        artistId: 'a1',
      },
    ])
    expect(`${asked[0]?.origin ?? ''}${asked[0]?.pathname ?? ''}`).toBe('https://musicbrainz.org/ws/2/release/')
    expect(asked[0]?.searchParams.get('query')).toBe('release:"Night Drive" AND artist:"Northline"')
    expect(asked[0]?.searchParams.get('fmt')).toBe('json')
  })

  it('asks for a title without its edition in brackets in the same request', async () => {
    const asked: URL[] = []
    const fetchImpl = ((input: RequestInfo | URL) => {
      asked.push(urlOf(input))
      return Promise.resolve(Response.json({ releases: [] }))
    }) as typeof fetch
    await findReleases('Born This Way (International Special Edition Version)', 'Lady Gaga', fetchImpl)
    expect(asked).toHaveLength(1)
    expect(asked[0]?.searchParams.get('query')).toBe(
      '(release:"Born This Way (International Special Edition Version)" OR release:"Born This Way") AND artist:"Lady Gaga"',
    )
  })

  it('drops only the editions in brackets at the end of a title', () => {
    expect(titleWithoutEdition('Born This Way (International Special Edition Version)')).toBe('Born This Way')
    expect(titleWithoutEdition('Title (Deluxe) [Remastered 2011]')).toBe('Title')
    expect(titleWithoutEdition('(What’s the Story) Morning Glory?')).toBeNull()
    expect(titleWithoutEdition('Night Drive')).toBeNull()
    expect(titleWithoutEdition('(Untitled)')).toBeNull()
    expect(titleWithoutEdition('Quiet Meridian (The Complete Anniversary Recordings)')).toBe('Quiet Meridian')
  })

  it('asks for the base title before a subtitle too, and fifty releases, as an album has dozens of editions', async () => {
    const asked: URL[] = []
    const fetchImpl = ((input: RequestInfo | URL) => {
      asked.push(urlOf(input))
      return Promise.resolve(Response.json({ releases: [] }))
    }) as typeof fetch
    await findReleases('Fallen: 20th Anniversary Edition', 'Evanescence', fetchImpl)
    expect(asked[0]?.searchParams.get('query')).toBe(
      '(release:"Fallen: 20th Anniversary Edition" OR release:"Fallen") AND artist:"Evanescence"',
    )
    expect(asked[0]?.searchParams.get('limit')).toBe('50')
  })

  it('names the shorter forms of a title and the words its edition adds', () => {
    expect(titleVariants('Fallen: 20th Anniversary Edition')).toEqual(['Fallen: 20th Anniversary Edition', 'Fallen'])
    expect(titleVariants('Mezmerize - Remastered (Deluxe)')).toEqual([
      'Mezmerize - Remastered (Deluxe)',
      'Mezmerize - Remastered',
      'Mezmerize',
    ])
    expect(titleVariants('Night Drive')).toEqual(['Night Drive'])
    // A subtitle separator at the start leaves the title whole.
    expect(titleVariants(': Untitled')).toEqual([': Untitled'])
    expect(editionWords('Fallen: 20th Anniversary Edition')).toEqual(['20th', 'anniversary', 'edition'])
    expect(editionWords('Night Drive')).toEqual([])
  })

  it("reads an artist's albums and an album's editions, counting a release's tracks from its media", async () => {
    const fetchImpl = ((input: RequestInfo | URL) => {
      const url = urlOf(input)
      return Promise.resolve(
        Response.json(
          url.pathname.endsWith('/release-group')
            ? {
                'release-groups': [
                  { id: 'g2', title: 'The Open Door', 'first-release-date': '2006-09-25', 'primary-type': 'Album' },
                  {
                    id: 'g1',
                    title: 'Fallen',
                    'first-release-date': '2003-03-04',
                    'primary-type': 'Album',
                    'secondary-types': [],
                  },
                ],
              }
            : {
                releases: [
                  {
                    id: 'r1',
                    title: 'Fallen (20th anniversary)',
                    date: '2023-11-17',
                    media: [
                      { format: 'CD', 'track-count': 12 },
                      { format: 'CD', 'track-count': 9 },
                    ],
                    'artist-credit': [{ name: 'Evanescence', artist: { id: 'a1' } }],
                    'release-group': { id: 'g1', 'primary-type': 'Album' },
                  },
                ],
              },
        ),
      )
    }) as typeof fetch
    expect((await artistReleaseGroups('a1', fetchImpl)).map((group) => group.title)).toEqual([
      'Fallen',
      'The Open Door',
    ])
    resetPacing()
    const [release] = await groupReleases('g1', fetchImpl)
    expect(release).toMatchObject({ id: 'r1', trackCount: 21, score: 100, format: '2×CD', group: 'g1' })
  })

  it("reads an edition's tracks medium by medium, by its id only", async () => {
    const asked: string[] = []
    const fetchImpl = ((url: string) => {
      asked.push(url)
      return Promise.resolve(
        url.includes('/release/gone')
          ? new Response(null, { status: 404 })
          : Response.json({
              media: [
                {
                  position: 1,
                  tracks: [
                    { position: 1, number: '1', title: 'Going Under', length: 214_000 },
                    { position: 2, title: 'Bring Me to Life', length: null },
                  ],
                },
                { position: 2, tracks: [{ position: 1, number: 'A1', title: 'Whisper', length: 0 }, { title: '' }] },
              ],
            }),
      )
    }) as typeof fetch
    expect(await releaseTracks('r1', fetchImpl)).toEqual([
      { disc: 1, number: '1', title: 'Going Under', lengthMs: 214_000 },
      { disc: 1, number: '2', title: 'Bring Me to Life', lengthMs: null },
      { disc: 2, number: 'A1', title: 'Whisper', lengthMs: null },
    ])
    expect(asked[0]).toBe('https://musicbrainz.org/ws/2/release/r1?inc=recordings&fmt=json')
    resetPacing()
    expect(await releaseTracks('gone', fetchImpl)).toBeNull()
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

  it('keeps a second between requests asked at once, in the order asked', async () => {
    vi.useFakeTimers()
    try {
      const times: number[] = []
      const fetchImpl = (() => {
        times.push(Date.now())
        return Promise.resolve(Response.json({ releases: [] }))
      }) as typeof fetch
      const all = Promise.all([findReleases('A', 'B', fetchImpl), findReleases('C', 'D', fetchImpl)])
      await vi.advanceTimersByTimeAsync(1200)
      await all
      expect(times).toHaveLength(2)
      expect((times[1] ?? 0) - (times[0] ?? 0)).toBeGreaterThanOrEqual(1100)
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

  it('puts the editions that share the words of the album title before the plain ones', () => {
    const editions = [
      { id: 'plain', title: 'Fallen', score: 100, trackCount: 11 },
      {
        id: 'box',
        title: 'Fallen',
        disambiguation: '20th anniversary super deluxe box set',
        score: 100,
        trackCount: 32,
      },
      { id: 'anniversary', title: 'Fallen (20th anniversary)', score: 88, trackCount: 21 },
    ]
    const title = 'Fallen: 20th Anniversary Edition'
    // The album's number of tracks first, then the shared edition words, then the score.
    expect(rankReleases(editions, 21, title).map((edition) => edition.id)).toEqual(['anniversary', 'box', 'plain'])
    expect(rankReleases(editions, null, title).map((edition) => edition.id)).toEqual(['box', 'anniversary', 'plain'])
    expect(pickRelease(editions, null, title)?.id).toBe('box')
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
