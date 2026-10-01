import { afterEach, describe, expect, it } from 'vitest'
import { findArtist, resetPacing } from '../../src/gateway/musicbrainz'
import { commonsImage, imageBytes, plainText, wikidataImage } from '../../src/gateway/wikimedia'

const urlOf = (input: RequestInfo | URL) => new URL(input instanceof Request ? input.url : input.toString())
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])

describe("an artist's photo", () => {
  afterEach(() => resetPacing())

  it('finds the exact artist on MusicBrainz with its Commons image and Wikidata links', async () => {
    const asked: URL[] = []
    const fetchImpl = ((input: RequestInfo | URL) => {
      const url = urlOf(input)
      asked.push(url)
      if (url.pathname === '/ws/2/artist/')
        return Promise.resolve(
          Response.json({
            artists: [
              { id: 'uk', name: 'Nirvana', score: 75 },
              { id: 'us', name: 'Nirvana', score: 100 },
              { id: 'x', name: 'Nirvana Tribute', score: 95 },
            ],
          }),
        )
      return Promise.resolve(
        Response.json({
          relations: [
            { type: 'image', url: { resource: 'https://commons.wikimedia.org/wiki/File:Nirvana_around_1992.jpg' } },
            { type: 'wikidata', url: { resource: 'https://www.wikidata.org/wiki/Q11649' } },
          ],
        }),
      )
    }) as typeof fetch
    expect(await findArtist('nirvana', fetchImpl)).toEqual({
      id: 'us',
      name: 'Nirvana',
      commonsFile: 'Nirvana_around_1992.jpg',
      wikidata: 'Q11649',
      official: null,
      bandcamp: null,
      discogs: null,
    })
    expect(asked[0]?.searchParams.get('query')).toBe('artist:"nirvana" OR alias:"nirvana"')
    expect(asked[1]?.pathname).toBe('/ws/2/artist/us')
    expect(asked[1]?.searchParams.get('inc')).toBe('url-rels')
  })

  it("reads a Wikidata item's image and a Commons file's thumbnail, author and licence", async () => {
    const fetchImpl = ((input: RequestInfo | URL) => {
      const url = urlOf(input)
      if (url.hostname === 'www.wikidata.org')
        return Promise.resolve(
          Response.json({
            entities: { Q1: { claims: { P18: [{ mainsnak: { datavalue: { value: 'Band 1992.jpg' } } }] } } },
          }),
        )
      expect(url.searchParams.get('origin')).toBe('*')
      expect(url.searchParams.get('titles')).toBe('File:Band 1992.jpg')
      return Promise.resolve(
        Response.json({
          query: {
            pages: {
              '-1': {
                imageinfo: [
                  {
                    // As Commons answers since 2026: thumbnails on thumb.wikimedia.org, the original on upload.
                    thumburl:
                      'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b1/Band.jpg/500px-Band.jpg?utm_source=commons.wikimedia.org',
                    url: 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Band.jpg',
                    descriptionurl: 'https://commons.wikimedia.org/wiki/File:Band_1992.jpg',
                    extmetadata: {
                      Artist: { value: '<a href="https://example.org/p">P.B. Rage</a> from USA' },
                      LicenseShortName: { value: 'CC BY-SA 2.0' },
                      LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/2.0' },
                    },
                  },
                ],
              },
            },
          },
        }),
      )
    }) as typeof fetch
    expect(await wikidataImage('Q1', fetchImpl)).toBe('Band 1992.jpg')
    expect(await wikidataImage('not-an-item', fetchImpl)).toBeNull()
    expect(await commonsImage('Band 1992.jpg', fetchImpl)).toEqual({
      urls: [
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b1/Band.jpg/500px-Band.jpg?utm_source=commons.wikimedia.org',
        'https://upload.wikimedia.org/wikipedia/commons/b/b1/Band.jpg',
      ],
      page: 'https://commons.wikimedia.org/wiki/File:Band_1992.jpg',
      author: 'P.B. Rage from USA',
      license: 'CC BY-SA 2.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0',
    })
  })

  it('keeps only images from the upload host, as JPEG or PNG', async () => {
    const elsewhere = (() =>
      Promise.resolve(
        Response.json({ query: { pages: { 1: { imageinfo: [{ thumburl: 'https://evil.example/x.jpg' }] } } } }),
      )) as typeof fetch
    expect(await commonsImage('x.jpg', elsewhere)).toBeNull()
    expect(
      (await imageBytes('https://upload.wikimedia.org/x.jpg', () => Promise.resolve(new Response(JPEG))))?.type,
    ).toBe('image/jpeg')
    expect(
      await imageBytes('https://upload.wikimedia.org/x.svg', () => Promise.resolve(new Response('<svg/>'))),
    ).toBeNull()
  })

  it("reads the owner's real Commons answer: a thumbnail on thumb.wikimedia.org, a red-linked author", async () => {
    const answer = {
      continue: { iistart: '2020-12-16T18:38:16Z', continue: '||' },
      query: {
        pages: {
          '92854049': {
            pageid: 92854049,
            ns: 6,
            title: 'File:Mylène farmer Live 2019 (cropped).jpg',
            imagerepository: 'local',
            imageinfo: [
              {
                thumburl:
                  'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d3/Myl%C3%A8ne_farmer_Live_2019_%28cropped%29.jpg/500px-Myl%C3%A8ne_farmer_Live_2019_%28cropped%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail',
                thumbwidth: 500,
                thumbheight: 641,
                url: 'https://upload.wikimedia.org/wikipedia/commons/d/d3/Myl%C3%A8ne_farmer_Live_2019_%28cropped%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original',
                descriptionurl: 'https://commons.wikimedia.org/wiki/File:Myl%C3%A8ne_farmer_Live_2019_(cropped).jpg',
                extmetadata: {
                  Artist: {
                    value:
                      '<a href="//commons.wikimedia.org/w/index.php?title=User:Boydu90&amp;action=edit&amp;redlink=1" class="new" title="User:Boydu90 (page does not exist)">Boydu90</a>',
                    source: 'commons-desc-page',
                  },
                  LicenseShortName: { value: 'CC BY-SA 4.0', source: 'commons-desc-page', hidden: '' },
                  LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0', source: 'commons-desc-page' },
                },
              },
            ],
          },
        },
      },
    }
    const image = await commonsImage('Mylène farmer Live 2019 (cropped).jpg', () =>
      Promise.resolve(Response.json(answer)),
    )
    expect(image?.urls[0]?.startsWith('https://thumb.wikimedia.org/')).toBe(true)
    expect(image?.urls[1]?.startsWith('https://upload.wikimedia.org/')).toBe(true)
    expect(image?.author).toBe('Boydu90')
    expect(image?.license).toBe('CC BY-SA 4.0')
  })

  it('turns the HTML Commons keeps for authors into plain text', () => {
    expect(plainText('<span>A &amp; B</span>&nbsp;<i>photo</i>')).toBe('A & B photo')
  })
})
