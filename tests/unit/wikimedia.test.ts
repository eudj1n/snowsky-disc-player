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
    })
    expect(asked[0]?.searchParams.get('query')).toBe('artist:"nirvana"')
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
                    thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Band.jpg/500px-Band.jpg',
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
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Band.jpg/500px-Band.jpg',
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

  it('turns the HTML Commons keeps for authors into plain text', () => {
    expect(plainText('<span>A &amp; B</span>&nbsp;<i>photo</i>')).toBe('A & B photo')
  })
})
