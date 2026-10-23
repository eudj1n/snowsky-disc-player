import { beforeEach, describe, expect, it } from 'vitest'
import {
  artistTags,
  ListenBrainzTokenNeeded,
  popularGroups,
  popularRecordings,
  resetListenBrainzPacing,
  similarArtists,
  SIMILAR_ARTISTS_KEPT,
  TAGS_BATCH,
} from '../../src/gateway/listenbrainz'

const MBID = 'cc197bad-dc9c-440d-a5b5-d52ba2e14234'
const OTHER = 'a74b1b7f-71a5-4011-9441-d0b5e4122711'
const THIRD = '9c9f1380-2516-4fc9-a3e6-f9f61941d090'
const answer =
  (status: number, body: unknown, asked: string[] = [], headers: Record<string, string> = {}): typeof fetch =>
  (input) => {
    asked.push(input instanceof Request ? input.url : input.toString())
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers }))
  }

describe('ListenBrainz', () => {
  beforeEach(() => resetListenBrainzPacing())

  it('reads similar artists by id, the closest first, the artist itself and malformed rows aside', async () => {
    const asked: string[] = []
    const found = await similarArtists(
      MBID,
      answer(
        200,
        [
          { artist_mbid: THIRD, name: 'Muse', comment: 'UK rock band', score: 8288 },
          { artist_mbid: OTHER, name: 'Radiohead', comment: '', score: 9919 },
          { artist_mbid: MBID, name: 'Coldplay', score: 10000 },
          { artist_mbid: 'nope', name: 'Broken', score: 1 },
          { name: 'Nameless' },
        ],
        asked,
      ),
    )
    expect(found).toEqual([
      { mbid: OTHER, name: 'Radiohead', comment: null, score: 9919 },
      { mbid: THIRD, name: 'Muse', comment: 'UK rock band', score: 8288 },
    ])
    expect(asked[0]).toMatch(/^https:\/\/labs\.api\.listenbrainz\.org\/similar-artists\/json\?artist_mbids=cc197bad/)
    expect(asked[0]).toContain('algorithm=session_based')
  })

  it('keeps at most the first page of similar artists', async () => {
    const many = Array.from({ length: 70 }, (_, index) => ({
      artist_mbid: `${String(index).padStart(8, '0')}-0000-4000-8000-000000000000`,
      name: `Artist ${String(index)}`,
      score: 1000 - index,
    }))
    expect(await similarArtists(MBID, answer(200, many))).toHaveLength(SIMILAR_ARTISTS_KEPT)
  })

  it('reads the most listened recordings and release groups, counts as numbers', async () => {
    const recordings = await popularRecordings(
      MBID,
      answer(200, [
        { recording_mbid: 'r2', recording_name: 'Yellow', total_listen_count: 300, total_user_count: 20 },
        { recording_mbid: 'r1', recording_name: 'Viva la vida', total_listen_count: 4067550, total_user_count: 248853 },
        { recording_mbid: 'r3', recording_name: '' },
      ]),
    )
    expect(recordings).toEqual([
      { mbid: 'r1', name: 'Viva la vida', listens: 4067550, listeners: 248853 },
      { mbid: 'r2', name: 'Yellow', listens: 300, listeners: 20 },
    ])
    const groups = await popularGroups(
      MBID,
      answer(200, [
        {
          release_group_mbid: 'g1',
          release_group: { name: 'Viva la Vida', date: '2008-05-26', type: 'Album' },
          total_listen_count: 19505368,
          total_user_count: 300853,
        },
        { release_group_mbid: 'g2', release_group: { name: 'Parachutes' }, total_listen_count: 'many' },
        { release_group_mbid: 'g3' },
      ]),
    )
    expect(groups).toEqual([
      { mbid: 'g1', name: 'Viva la Vida', date: '2008-05-26', type: 'Album', listens: 19505368, listeners: 300853 },
      { mbid: 'g2', name: 'Parachutes', date: null, type: null, listens: 0, listeners: 0 },
    ])
  })

  it('answers nothing for an artist ListenBrainz does not know, and throws when it cannot answer', async () => {
    expect(await similarArtists(MBID, answer(404, { error: 'not found' }))).toEqual([])
    expect(await popularRecordings(MBID, answer(200, { error: 'odd' }))).toEqual([])
    await expect(popularGroups(MBID, answer(503, ''))).rejects.toThrow('503')
  })

  it("sends the owner's token to the main API as a Token header, and names a 401 for want of one", async () => {
    const seen: (string | null)[] = []
    const fetchImpl: typeof fetch = (input, init) => {
      const url = input instanceof Request ? input.url : input.toString()
      const headers = new Headers(init?.headers)
      seen.push(headers.get('Authorization'))
      const groups = url.includes('release-groups')
      const body = groups
        ? [{ release_group_mbid: 'g1', release_group: { name: 'Parachutes' }, total_listen_count: 1 }]
        : [{ recording_mbid: 'r1', recording_name: 'Yellow', total_listen_count: 1 }]
      const status = groups || headers.get('Authorization') === 'Token abc-123' ? 200 : 401
      return Promise.resolve(new Response(JSON.stringify(body), { status }))
    }
    await expect(popularRecordings(MBID, fetchImpl)).rejects.toBeInstanceOf(ListenBrainzTokenNeeded)
    expect(await popularRecordings(MBID, fetchImpl, 'abc-123')).toHaveLength(1)
    expect(await popularGroups(MBID, fetchImpl)).toHaveLength(1)
    expect(seen).toEqual([null, 'Token abc-123', null])
  })

  it("reads artists' tags in batches, genres marked, an artist ListenBrainz does not know given none", async () => {
    const asked: string[] = []
    const ids = Array.from(
      { length: TAGS_BATCH + 2 },
      (_, n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`,
    )
    const fetchImpl: typeof fetch = (input) => {
      const url = new URL(input instanceof Request ? input.url : input.toString())
      asked.push(url.toString())
      const wanted = (url.searchParams.get('artist_mbids') ?? '').split(',')
      // The first id of the batch answers; the second is unknown to ListenBrainz.
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              artist_mbid: wanted[0],
              name: 'A',
              tag: { artist: [{ tag: 'british', count: 3 }, { tag: 'rock', count: 10, genre_mbid: 'x' }, { tag: '' }] },
            },
          ]),
          { status: 200 },
        ),
      )
    }
    const found = await artistTags(ids, fetchImpl)
    expect(asked).toHaveLength(2)
    expect(asked[0]).toMatch(/^https:\/\/api\.listenbrainz\.org\/1\/metadata\/artist\/\?artist_mbids=/)
    expect(asked[0]).toContain('inc=tag')
    expect(Object.keys(found)).toHaveLength(ids.length)
    expect(found[ids[0] ?? '']).toEqual([
      { tag: 'rock', count: 10, genre: true },
      { tag: 'british', count: 3, genre: false },
    ])
    expect(found[ids[1] ?? '']).toEqual([])
    expect(found[ids[TAGS_BATCH] ?? '']).toHaveLength(2)
  })

  it('waits out the window a 429 names, then asks once more', async () => {
    const asked: string[] = []
    let first = true
    const fetchImpl: typeof fetch = (input) => {
      asked.push(input instanceof Request ? input.url : input.toString())
      if (first) {
        first = false
        return Promise.resolve(new Response('', { status: 429, headers: { 'X-RateLimit-Reset-In': '0.01' } }))
      }
      return Promise.resolve(
        new Response(JSON.stringify([{ recording_mbid: 'r1', recording_name: 'Yellow', total_listen_count: 1 }]), {
          status: 200,
        }),
      )
    }
    const started = Date.now()
    expect(await popularRecordings(MBID, fetchImpl)).toHaveLength(1)
    expect(asked).toHaveLength(2)
    expect(Date.now() - started).toBeGreaterThanOrEqual(9)
  })
})
