import { describe, expect, it } from 'vitest'
import { GatewayHttp } from '../../src/gateway/http'
import {
  addTracks,
  createPlaylist,
  deletePlaylist,
  removeFavorite,
  removeTrack,
  renamePlaylist,
  toRanges,
} from '../../src/gateway/playlists'

type Row = { name: string; author: string }
const LIBRARY: Row[] = [
  { name: 'Волны', author: 'Берег' },
  { name: 'Тихий океан', author: 'Берег' },
  { name: 'Orbit', author: 'Forma' },
  { name: 'Still Here', author: 'Forma' },
]
const ALBUM_OF: Record<string, string> = {
  Волны: 'Море',
  'Тихий океан': 'Море',
  Orbit: 'Inner Space',
  'Still Here': 'Inner Space',
}
/** Stock's source list for an add or a read: one album's tracks, or the whole library. */
const sourceRows = (headers: Record<string, string>) =>
  headers.type === 'album/song'
    ? LIBRARY.filter((row) => ALBUM_OF[row.name] === decodeURIComponent(headers.album ?? ''))
    : LIBRARY

/** A tiny stateful stock behind the gateway: lists by position, members, library. */
function stock(options: { ignoreWrites?: boolean; status?: number } = {}) {
  const lists: { name: string; members: Row[] }[] = [
    { name: 'Evening', members: [LIBRARY[0] as Row] },
    { name: 'Road trip', members: [] },
  ]
  const writes: { path: string; method: string; headers: Record<string, string>; body: string | null }[] = []
  const favorites: Row[] = [LIBRARY[2] as Row, LIBRARY[3] as Row]
  const handle = (input: RequestInfo | URL, init?: RequestInit): Response => {
    const url = new URL(input instanceof Request ? input.url : input.toString(), 'http://x')
    const path = url.pathname.replace('/api/stock', '')
    const headers = (init?.headers ?? {}) as Record<string, string>
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      writes.push({ path, method, headers, body: typeof init?.body === 'string' ? init.body : null })
      if (options.status) return new Response('refused', { status: options.status })
      if (!options.ignoreWrites) {
        const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as [number, number][]) : []
        if (path === '/custom_list_cmd/' && headers.type === 'create')
          lists.push({ name: decodeURIComponent(headers.list_name ?? ''), members: [] })
        if (path === '/custom_list_cmd/' && headers.type === 'update') {
          const list = lists[Number(headers.list_id)]
          if (list) list.name = decodeURIComponent(headers.list_name ?? '')
        }
        if (path === '/add_custom_list/') {
          const list = lists[Number(headers.dst_list_id)]
          for (const [first, last] of body) list?.members.push(...sourceRows(headers).slice(first, last + 1))
        }
        if (path === '/song_category_tree/' && headers.type === 'custom') lists.splice(body[0]?.[0] ?? -1, 1)
        if (path === '/song_category_tree/' && headers.type === 'love/song') favorites.splice(body[0]?.[0] ?? -1, 1)
        if (path === '/song_category_tree/' && headers.type === 'custom/song') {
          const list = lists[Number(headers.src_list_id)]
          if (list) list.members = list.members.filter((_, index) => index !== body[0]?.[0])
        }
      }
      return new Response('', { status: 200 })
    }
    const rows =
      headers.type === 'custom'
        ? lists.map((list, pos) => ({ pos, name: list.name, author: '', count: list.members.length }))
        : headers.type === 'custom/song'
          ? (lists[Number(headers.src_list_id)]?.members ?? [])
          : headers.type === 'love/song'
            ? favorites
            : sourceRows(headers)
    const start = Number(headers['start-pos'])
    const page = rows.slice(start, start + Number(headers['num-max']))
    return new Response(JSON.stringify(page), { headers: { 'total-num': String(rows.length) } })
  }
  const impl = (input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handle(input, init))
  const deps = { http: new GatewayHttp(impl), token: 't'.repeat(43) }
  return { lists, favorites, writes, deps }
}

describe('playlist ranges', () => {
  it('merges sorted positions into inclusive ranges', () => {
    expect(toRanges([7, 1, 3, 2])).toEqual([
      [1, 3],
      [7, 7],
    ])
  })
})

describe('guarded playlist editing', () => {
  it('creates a playlist once and confirms it by name', async () => {
    const { writes, deps } = stock()
    expect(await createPlaylist(deps, 'Ночь +')).toBe('confirmed')
    expect(writes).toHaveLength(1)
    expect(writes[0]?.headers).toMatchObject({ type: 'create', list_name: '%D0%9D%D0%BE%D1%87%D1%8C%20%2B' })
    expect(writes[0]?.headers['X-Disc-Token']).toBeDefined()
    expect(await createPlaylist(deps, 'Evening')).toBe('exists')
    expect(writes).toHaveLength(1)
  })

  it('renames by the fresh position of the unique name', async () => {
    const { writes, deps } = stock()
    expect(await renamePlaylist(deps, 'Road trip', 'Drive')).toBe('confirmed')
    expect(writes[0]?.headers).toMatchObject({ type: 'update', list_id: '1', list_name: 'Drive' })
    expect(await renamePlaylist(deps, 'Drive', 'Drive')).toBe('already')
  })

  it('adds library tracks as ranges and refuses tracks already in the list', async () => {
    const { lists, writes, deps } = stock()
    const tracks = [
      { title: 'Orbit', artist: 'Forma' },
      { title: 'Still Here', artist: 'Forma' },
      { title: 'Тихий океан', artist: 'Берег' },
    ]
    expect(await addTracks(deps, 'Road trip', tracks)).toBe('confirmed')
    expect(writes[0]?.headers).toMatchObject({ type: 'all/song', dst_list_id: '1' })
    expect(writes[0]?.body).toBe('[[1,3]]')
    expect(lists[1]?.members).toHaveLength(3)
    expect(await addTracks(deps, 'Evening', [{ title: 'Волны', artist: 'Берег' }])).toBe('duplicate')
    expect(writes).toHaveLength(1)
  })

  it("takes tracks of one album from that album's list, not the whole library", async () => {
    const { lists, writes, deps } = stock()
    const reads: string[] = []
    const read = deps.http.stockRead.bind(deps.http)
    deps.http.stockRead = (path, headers) => {
      reads.push(headers?.type ?? '')
      return read(path, headers)
    }
    const tracks = [
      { title: 'Still Here', artist: 'Forma', album: 'Inner Space' },
      { title: 'Orbit', artist: 'Forma', album: 'Inner Space' },
    ]
    expect(await addTracks(deps, 'Road trip', tracks)).toBe('confirmed')
    expect(writes[0]?.headers).toMatchObject({ type: 'album/song', album: 'Inner%20Space', dst_list_id: '1' })
    expect(writes[0]?.body).toBe('[[0,1]]')
    expect(lists[1]?.members.map((row) => row.name)).toEqual(['Orbit', 'Still Here'])
    expect(reads).not.toContain('all/song')
    // Tracks of two albums, or without one, still come from the whole library.
    const mixed = [
      { title: 'Волны', artist: 'Берег', album: 'Море' },
      { title: 'Orbit', artist: 'Forma', album: 'Inner Space' },
    ]
    expect(await addTracks(deps, 'Road trip', mixed)).toBe('duplicate')
    expect(await addTracks(deps, 'Evening', [{ title: 'Тихий океан', artist: 'Берег', album: null }])).toBe('confirmed')
    expect(writes[1]?.headers).toMatchObject({ type: 'all/song' })
    expect(reads).toContain('all/song')
  })

  it('removes one member and deletes a list, files untouched (delete_source 0)', async () => {
    const { lists, writes, deps } = stock()
    expect(await removeTrack(deps, 'Evening', { title: 'Волны', artist: 'Берег' })).toBe('confirmed')
    expect(writes[0]?.headers).toMatchObject({ type: 'custom/song', src_list_id: '0', delete_source: '0' })
    expect(await deletePlaylist(deps, 'Evening')).toBe('confirmed')
    expect(writes[1]?.body).toBe('[[0,0]]')
    expect(lists.map((list) => list.name)).toEqual(['Road trip'])
  })

  it('removes a favorite by its fresh love/song position and confirms the rest', async () => {
    const { favorites, writes, deps } = stock()
    expect(await removeFavorite(deps, { title: 'Still Here', artist: 'Forma' })).toBe('confirmed')
    expect(writes[0]?.headers).toMatchObject({ type: 'love/song', delete_source: '0' })
    expect(writes[0]?.body).toBe('[[1,1]]')
    expect(favorites.map((row) => row.name)).toEqual(['Orbit'])
    expect(await removeFavorite(deps, { title: 'Nope', artist: 'Forma' })).toBe('changed')
  })

  it('reports uncertain when the write changes nothing, and not sent when the gateway refuses', async () => {
    expect(await createPlaylist(stock({ ignoreWrites: true }).deps, 'Night')).toBe('uncertain')
    expect(await createPlaylist(stock({ status: 409 }).deps, 'Night')).toBe('not-sent')
    expect(await createPlaylist(stock({ status: 502 }).deps, 'Night')).toBe('uncertain')
    expect(await createPlaylist(stock().deps, ' padded')).toBe('invalid')
  })

  it('does not write when a scan was observed', async () => {
    const { writes, deps } = stock()
    const outcome = await createPlaylist(
      {
        ...deps,
        guard: () => {
          throw new Error('scan')
        },
      },
      'Night',
    )
    expect(outcome).toBe('not-sent')
    expect(writes).toHaveLength(0)
  })
})
