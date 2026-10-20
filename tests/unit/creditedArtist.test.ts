import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** The player's store and the pairing: every identity is kept, and what was put is recorded. */
const store = vi.hoisted(() => ({ puts: [] as Record<string, unknown>[] }))
vi.mock('../../src/stores/connection', () => ({
  connection: { store: true },
  http: {},
  originAllowed: () => true,
}))
vi.mock('../../src/stores/pairing', () => ({ pairingToken: () => '00000000000000' }))
vi.mock('../../src/stores/externalSources', () => ({ sourceAllowed: () => true }))
vi.mock('../../src/gateway/store', () => ({
  readCollection: () => Promise.resolve([]),
  putRecord: (_http: unknown, _collection: string, value: Record<string, unknown>) => {
    store.puts.push(value)
    return Promise.resolve('confirmed')
  },
  deleteRecord: () => Promise.resolve('confirmed'),
}))

const { lookupArtist, resetPacing } = await import('../../src/gateway/musicbrainz')
const { artistIdentity, confirmArtist, confirmEdition, identifyCreditedArtist, loadMusicbrainzIds } =
  await import('../../src/stores/musicbrainzIds')
const { artistFacts } = await import('../../src/stores/musicbrainzIds')
import type { ReleaseCandidate } from '../../src/gateway/musicbrainz'

const ARTIST = '7a1d2c3b-0000-4000-8000-00000000a001'
const GROUP = '7a1d2c3b-0000-4000-8000-00000000c001'
const detail = {
  id: ARTIST,
  name: 'Northline',
  'sort-name': 'Northline',
  type: 'Group',
  country: 'GB',
  'life-span': { begin: '2001' },
  aliases: [{ name: 'The Northline' }],
  relations: [{ type: 'official homepage', url: { resource: 'https://northline.example' } }],
}
const release = (over: Partial<ReleaseCandidate> = {}): ReleaseCandidate => ({
  id: '7a1d2c3b-0000-4000-8000-00000000b001',
  group: GROUP,
  title: 'Night Drive',
  artist: 'Northline',
  date: '2004-06-01',
  trackCount: 3,
  score: 100,
  country: 'GB',
  format: 'CD',
  label: 'Lumen Records',
  catalogNumber: 'NL-001',
  barcode: null,
  type: 'Album',
  disambiguation: null,
  artistId: ARTIST,
  credits: 1,
  ...over,
})

/** MusicBrainz, answering the artist by id and the release group; records what was asked. */
function musicbrainz(artist: unknown = detail) {
  const asked: string[] = []
  const fetchImpl = ((input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    asked.push(url.pathname)
    if (url.pathname === `/ws/2/artist/${ARTIST}`)
      return Promise.resolve(artist === null ? new Response('', { status: 404 }) : Response.json(artist))
    if (url.pathname.startsWith('/ws/2/release-group/'))
      return Promise.resolve(Response.json({ id: GROUP, 'first-release-date': '2003', 'primary-type': 'Album' }))
    return Promise.resolve(new Response('', { status: 404 }))
  }) as typeof fetch
  return { asked, fetchImpl }
}

describe('an artist identified with the edition it is credited on', () => {
  beforeEach(async () => {
    store.puts = []
    resetPacing()
    await loadMusicbrainzIds()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads an artist by its id with its aliases and links in one request', async () => {
    const { asked, fetchImpl } = musicbrainz()
    const found = await lookupArtist(ARTIST, fetchImpl)
    expect(found?.candidate).toMatchObject({
      id: ARTIST,
      name: 'Northline',
      type: 'Group',
      country: 'GB',
      begin: '2001',
      aliases: ['The Northline'],
      score: 100,
    })
    expect(found?.links.official).toBe('https://northline.example')
    expect(asked).toEqual([`/ws/2/artist/${ARTIST}`])
    expect(await lookupArtist(ARTIST, musicbrainz(null).fetchImpl)).toBeNull()
  })

  it('identifies the album’s artist when the edition credits one artist carrying the name', async () => {
    const { asked, fetchImpl } = musicbrainz()
    vi.stubGlobal('fetch', fetchImpl)
    expect(await confirmEdition('Night Drive|Northline', release(), 'Northline')).toBe(true)
    expect(artistIdentity('Northline')?.mbid).toBe(ARTIST)
    expect(artistIdentity('Northline')?.facts?.links.official).toBe('https://northline.example')
    expect(store.puts.map((put) => [put.kind, put.name])).toEqual([
      ['album', 'Night Drive|Northline'],
      ['artist', 'Northline'],
    ])
    expect(asked).toEqual([`/ws/2/release-group/${GROUP}`, `/ws/2/artist/${ARTIST}`])
  })

  it('takes an alias as the name, and leaves a doubtful credit to the listener', async () => {
    vi.stubGlobal('fetch', musicbrainz().fetchImpl)
    expect(await identifyCreditedArtist('the northline', release())).toBe(true)
    expect(artistIdentity('the northline')?.mbid).toBe(ARTIST)
    // Another name, a joint credit, no credit id: nothing is identified, nothing asked.
    expect(await identifyCreditedArtist('Northliner', release())).toBe(false)
    expect(await identifyCreditedArtist('Northline', release({ credits: 2 }))).toBe(false)
    expect(await identifyCreditedArtist('Northline', release({ artistId: null }))).toBe(false)
    expect(artistIdentity('Northline')).toBeNull()
  })

  it('leaves an artist already identified alone', async () => {
    const { asked, fetchImpl } = musicbrainz()
    vi.stubGlobal('fetch', fetchImpl)
    const other = '7a1d2c3b-0000-4000-8000-00000000a002'
    await confirmArtist(
      'Northline',
      other,
      artistFacts({ ...detail, id: other, aliases: [], score: 100 } as never, null),
    )
    expect(await identifyCreditedArtist('Northline', release())).toBe(false)
    expect(artistIdentity('Northline')?.mbid).toBe(other)
    expect(asked).toEqual([])
  })
})
