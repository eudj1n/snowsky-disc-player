import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/stores/connection', () => ({ connection: { store: false }, http: {} }))
vi.mock('../../src/stores/pairing', () => ({ pairingToken: () => null }))

const { factParts, regionName } = await import('../../src/domain/artistFacts')
const { bestArtist, namedExactly, resetPacing, searchArtists } = await import('../../src/gateway/musicbrainz')
const { artistFacts } = await import('../../src/stores/musicbrainzIds')

const answer =
  (body: unknown, asked: URL[]): typeof fetch =>
  (input: RequestInfo | URL) => {
    asked.push(new URL(input instanceof Request ? input.url : input.toString()))
    return Promise.resolve(Response.json(body))
  }

describe("an artist's MusicBrainz identity", () => {
  afterEach(() => resetPacing())

  it('says what the artist is, where from, its years and how MusicBrainz tells it apart', () => {
    const facts = { type: 'Group', country: 'GB', begin: '1996-09', end: null, disambiguation: 'British band' }
    expect(factParts(facts, 'en', (type) => type.toLowerCase())).toEqual([
      'group',
      'United Kingdom',
      '1996–',
      'British band',
    ])
    expect(factParts({ ...facts, type: 'Spirit', end: '2008' }, 'ru', () => 'x')).toEqual([
      'Великобритания',
      '1996–2008',
      'British band',
    ])
    expect(
      factParts({ type: null, country: null, begin: null, end: null, disambiguation: null }, 'en', String),
    ).toEqual([])
    expect(regionName('Europe', 'en')).toBe('Europe')
  })

  it('puts the artists named exactly so first, by their own name or an alias, and takes one only when sure', async () => {
    const asked: URL[] = []
    const found = await searchArtists(
      'Kino',
      answer(
        {
          artists: [
            { id: 'uk', name: 'Kino', score: 100, country: 'GB', disambiguation: 'British prog supergroup' },
            { id: 'kk', name: 'Kant Kino', score: 98 },
            { id: 'ru', name: 'Кино', score: 92, country: 'SU', aliases: [{ name: 'Kino' }, { name: 'Kino' }] },
          ],
        },
        asked,
      ),
    )
    expect(asked[0]?.searchParams.get('query')).toBe('artist:"Kino" OR alias:"Kino"')
    expect(found.map((artist) => artist.id)).toEqual(['uk', 'ru', 'kk'])
    const russian = found.find((artist) => artist.id === 'ru')
    if (!russian) throw new Error('missing')
    expect(russian.aliases).toEqual(['Kino'])
    expect(namedExactly(russian, 'kino')).toBe(true)
    expect(bestArtist(found, 'Kino')?.id).toBe('uk')
    expect(bestArtist(found, 'Кино')?.id).toBe('ru')
    expect(bestArtist([{ ...russian, score: 80 }], 'Кино')).toBeNull()
  })

  it('keeps the facts within what the store takes', () => {
    const candidate = {
      id: 'x',
      name: 'Northline',
      sortName: 'Northline',
      type: 'Group',
      country: 'GB',
      begin: '2001',
      end: null,
      disambiguation: null,
      aliases: Array.from({ length: 40 }, (_, n) => `Alias ${String(n)} ${'·'.repeat(300)}`),
      score: 100,
    }
    const facts = artistFacts(candidate, {
      commonsFile: null,
      wikidata: 'Q42',
      official: 'https://northline.example/',
      bandcamp: `https://example.org/${'x'.repeat(400)}`,
      discogs: null,
    })
    expect(new TextEncoder().encode(JSON.stringify(facts)).length).toBeLessThanOrEqual(3072)
    expect(facts.aliases.length).toBeLessThan(12)
    expect(facts.links).toEqual({
      official: 'https://northline.example/',
      wikidata: 'https://www.wikidata.org/wiki/Q42',
    })
  })
})
