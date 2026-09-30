import { describe, expect, it } from 'vitest'
import {
  AUTO_SIZE,
  autoEntries,
  autoPlaylist,
  listable,
  listName,
  localDay,
  RECENT_PLAYS,
  sameEntries,
} from '../../src/domain/autoPlaylists'
import {
  pathsHash,
  playSource,
  sourceKey,
  type PlayRecord,
  type PlaySource,
  type ServicePlay,
} from '../../src/domain/history'
import type { LibraryTrack } from '../../src/domain/track'
import { deleteList, readList, writeList } from '../../src/gateway/lists'
import { GatewayHttp } from '../../src/gateway/http'

let nextId = 1
const track = (path: string, rest: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: nextId++,
  title: path.split('/').at(-1) ?? path,
  artist: 'A',
  album: 'X',
  albumArtist: null,
  genre: null,
  discNumber: null,
  trackNumber: null,
  addedAt: null,
  queuePosition: null,
  path,
  durationMs: null,
  fileName: path.split('/').at(-1) ?? path,
  ...rest,
})
const record = (path: string, playCount: number, lastPlayedAt: number, title: string | null = null): PlayRecord => ({
  path,
  title,
  playCount,
  lastPlayedAt,
})
const play = (path: string, title: string | null = null): ServicePlay => ({
  path,
  title,
  at: 0,
  seconds: 60,
  context: { type: 3, count: 1, hash: null, album: null, artist: null, genre: null, folder: null },
})
const none = () => false

describe('automatic playlists', () => {
  it('holds whole files only, each once, without disliked tracks', () => {
    const tracks = [
      track('/tmp/sdcard/A/1.flac'),
      track('/tmp/sdcard/A/image.flac', { cue: true, title: 'One' }),
      track('/tmp/sdcard/A/2.flac'),
      track('/tmp/sdcard/A/1.flac', { title: 'again' }),
    ]
    const disliked = (t: LibraryTrack) => t.path === '/tmp/sdcard/A/2.flac'
    expect(listable(tracks, disliked).map((t) => t.path)).toEqual(['/tmp/sdcard/A/1.flac'])
  })

  it('orders the most played, overall and by an artist of joint credits', () => {
    const tracks = [
      track('/tmp/sdcard/a.flac', { artist: 'Lumen' }),
      track('/tmp/sdcard/b.flac', { artist: 'Lumen; Kestrel' }),
      track('/tmp/sdcard/c.flac', { artist: 'Kestrel' }),
      track('/tmp/sdcard/d.flac', { artist: 'Lumen' }),
    ]
    const most = [
      record('/tmp/sdcard/a.flac', 2, 5),
      record('/tmp/sdcard/b.flac', 5, 3),
      record('/tmp/sdcard/c.flac', 9, 4),
    ]
    const input = { tracks, most, plays: [], disliked: none }
    expect(autoEntries({ kind: 'most_played' }, input)).toEqual([
      '/tmp/sdcard/c.flac',
      '/tmp/sdcard/b.flac',
      '/tmp/sdcard/a.flac',
    ])
    // The never played d stays out; a joint credit counts for each artist.
    expect(autoEntries({ kind: 'artist_most_played', artist: 'Lumen' }, input)).toEqual([
      '/tmp/sdcard/b.flac',
      '/tmp/sdcard/a.flac',
    ])
    expect(autoEntries({ kind: 'artist_most_played' }, input)).toEqual([])
  })

  it('lists the newest additions and at most fifty of anything', () => {
    const tracks = Array.from({ length: 60 }, (_, i) =>
      track(`/tmp/sdcard/n${String(i)}.flac`, { addedAt: i === 5 ? null : 1000 + i }),
    )
    const entries = autoEntries({ kind: 'recently_added' }, { tracks, most: [], plays: [], disliked: none })
    expect(entries).toHaveLength(AUTO_SIZE)
    expect(entries[0]).toBe('/tmp/sdcard/n59.flac')
    expect(entries).not.toContain('/tmp/sdcard/n5.flac')
  })

  it('finds what was played but not among the newest plays, the longest unplayed first', () => {
    const old = ['/tmp/sdcard/o1.flac', '/tmp/sdcard/o2.flac', '/tmp/sdcard/o3.flac']
    const tracks = [...old, '/tmp/sdcard/new.flac', '/tmp/sdcard/image.flac'].map((path) => track(path))
    const plays = [
      play(old[1] ?? ''),
      play(old[0] ?? ''),
      play(old[2] ?? ''),
      play('/tmp/sdcard/image.flac', 'A CUE track'),
      play('/tmp/sdcard/gone.flac'),
      ...Array.from({ length: RECENT_PLAYS - 1 }, () => play('/tmp/sdcard/new.flac')),
      // o3 was played again among the newest plays.
      play(old[2] ?? ''),
    ]
    expect(autoEntries({ kind: 'not_played_lately' }, { tracks, most: [], plays, disliked: none })).toEqual([
      '/tmp/sdcard/o2.flac',
      '/tmp/sdcard/o1.flac',
    ])
  })

  it('draws a daily mix: half loved, half rarely heard, the same all day and another the next', () => {
    const tracks = Array.from({ length: 120 }, (_, i) => track(`/tmp/sdcard/m${String(i)}.flac`))
    // Loved: 20 played often and 10 favorites; 90 others, played at most once, or twice (not fresh).
    const most = [
      ...Array.from({ length: 20 }, (_, i) => record(`/tmp/sdcard/m${String(i)}.flac`, 5, i)),
      record('/tmp/sdcard/m100.flac', 2, 1),
      record('/tmp/sdcard/m101.flac', 1, 1),
    ]
    const favorites = tracks.slice(20, 30)
    const input = { tracks, most, plays: [], disliked: none, favorites, day: '2026-09-30' }
    const mix = autoEntries({ kind: 'daily_mix' }, input)
    expect(mix).toHaveLength(AUTO_SIZE)
    expect(new Set(mix).size).toBe(AUTO_SIZE)
    // m100, played twice, is loved too; m101, played once, is fresh.
    const loved = new Set([...tracks.slice(0, 30).map((t) => t.path), '/tmp/sdcard/m100.flac'])
    expect(mix.filter((path) => loved.has(path))).toHaveLength(25)
    expect(autoEntries({ kind: 'daily_mix' }, input)).toEqual(mix)
    expect(autoEntries({ kind: 'daily_mix' }, { ...input, day: '2026-10-01' })).not.toEqual(mix)
    // Too little history: the loved half is made up from the rest.
    const early = autoEntries({ kind: 'daily_mix' }, { ...input, most: [], favorites: [] })
    expect(early).toHaveLength(AUTO_SIZE)
    expect(localDay(new Date(2026, 8, 30, 23, 59))).toBe('2026-09-30')
  })

  it('names lists as a FAT card keeps them', () => {
    expect(listName('Most played · AC/DC: Live?')).toBe('Most played · AC-DC- Live-')
    expect(listName('  .Dots and spaces. ')).toBe('Dots and spaces')
    const long = listName(`Самое прослушиваемое · ${'Ё'.repeat(60)}`)
    expect(new TextEncoder().encode(long).length).toBeLessThanOrEqual(96)
    expect(long.endsWith('Ё')).toBe(true)
  })

  it("reads only the store's records the page can keep", () => {
    expect(autoPlaylist({ name: 'Most played', kind: 'most_played', at: 1 })).toEqual({
      name: 'Most played',
      kind: 'most_played',
      at: 1,
    })
    expect(autoPlaylist({ name: 'x', kind: 'artist_most_played', at: 1 })).toBeNull()
    expect(autoPlaylist({ name: 'x', kind: 'mine', at: 1 })).toBeNull()
    expect(sameEntries(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(sameEntries(['a', 'b'], ['b', 'a'])).toBe(false)
  })
})

describe('plays of an automatic playlist', () => {
  it('are named by the hash of its entries, as stock records a list queue', () => {
    const entries = ['/tmp/sdcard/a.flac', '/tmp/sdcard/b.flac']
    const index = new Map<string, PlaySource>([[pathsHash(entries), { kind: 'list', name: 'Most played', count: 2 }]])
    const source = playSource(
      {
        type: 4,
        count: 2,
        hash: pathsHash([...entries].reverse()),
        album: null,
        artist: null,
        genre: null,
        folder: null,
      },
      index,
      [],
      { artists: new Set(), genres: new Set() },
    )
    expect(source).toEqual({ kind: 'list', name: 'Most played', count: 2 })
    expect(source && sourceKey(source)).toBe('list:Most played')
  })
})

describe('the lists gateway (combined-009)', () => {
  const fake = (handle: (url: string, init?: RequestInit) => Response) =>
    new GatewayHttp((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(handle(input instanceof Request ? input.url : input.toString(), init)),
    )

  it('writes a list whole with the serial number and reads its outcome', async () => {
    const seen: { url: string; method: string; body: unknown; token: string | null }[] = []
    let status = 201
    const http = fake((url, init) => {
      seen.push({
        url,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
        token: new Headers(init?.headers).get('X-Disc-Token'),
      })
      return new Response('{}', { status })
    })
    expect(await writeList(http, 'SN', 'external', 'Самое · A/B', ['/tmp/sdcard/a.flac'])).toBe('written')
    expect(seen[0]).toEqual({
      url: '/api/lists/external/%D0%A1%D0%B0%D0%BC%D0%BE%D0%B5%20%C2%B7%20A%2FB',
      method: 'PUT',
      body: { entries: ['/tmp/sdcard/a.flac'] },
      token: 'SN',
    })
    for (const [code, outcome] of [
      [200, 'written'],
      [400, 'refused'],
      [409, 'full'],
      [413, 'full'],
      [507, 'full'],
      [503, 'uncertain'],
    ] as const) {
      status = code
      expect(await writeList(http, 'SN', 'external', 'L', ['/tmp/sdcard/a.flac'])).toBe(outcome)
    }
    status = 404
    expect(await deleteList(http, 'SN', 'external', 'L')).toBe('deleted')
  })

  it('reads a list with its entries, and null for none', async () => {
    const http = fake((url) =>
      url.endsWith('/Gone')
        ? new Response('No such list\n', { status: 404 })
        : new Response(
            JSON.stringify({ name: 'L', path: '/tmp/sdcard/Playlists/L.m3u', entries: ['/tmp/sdcard/a.flac', 7] }),
            { status: 200 },
          ),
    )
    expect(await readList(http, 'external', 'L')).toEqual({
      name: 'L',
      path: '/tmp/sdcard/Playlists/L.m3u',
      entries: ['/tmp/sdcard/a.flac'],
    })
    expect(await readList(http, 'external', 'Gone')).toBeNull()
  })
})
