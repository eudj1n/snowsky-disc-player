import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { catalogPage, nameHeader } from '../../src/gateway/catalog'
import { GatewayHttp } from '../../src/gateway/http'
import { encodeRecord } from '../../src/gateway/record'
import { readQueue } from '../../src/gateway/queue'
import { selectAlbum, selectSource, artistAlbumSelector } from '../../src/gateway/selection'
import { GatewaySession, type SocketLike } from '../../src/gateway/session'

type Listener = (event: never) => void
class Socket implements SocketLike {
  readyState = 0
  sent: string[] = []
  private listeners = new Map<string, Listener[]>()
  constructor(private reply: (data: string) => string[]) {}
  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  emit(type: string, event: unknown = {}): void {
    for (const listener of this.listeners.get(type) ?? []) (listener as (e: unknown) => void)(event)
  }
  send(data: string): void {
    this.sent.push(data)
    for (const reply of this.reply(data)) queueMicrotask(() => this.emit('message', { data: reply }))
  }
  close(code = 1000): void {
    this.readyState = 3
    this.emit('close', { code })
  }
}

const ALBUM = 'Тихий океан'
const ROWS = [
  { name: 'Волны', author: 'Берег' },
  { name: 'Тихий океан', author: 'Берег' },
]

function http(pages: () => { rows: typeof ROWS; total: number }) {
  const calls: Record<string, string>[] = []
  const impl = (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string>
    calls.push(headers)
    const { rows, total } = pages()
    const start = Number(headers['start-pos'])
    const body = JSON.stringify(rows.slice(start, start + Number(headers['num-max'])))
    expect(input instanceof Request ? input.url : input.toString()).toBe('/api/stock/song_category_tree/')
    return Promise.resolve(new Response(body, { headers: { 'total-num': String(total) } }))
  }
  return { http: new GatewayHttp(impl), calls }
}

function playing(album: string, title: string, flag = 3) {
  const song = { song_name: title, song_artist_name: 'Берег', song_album_name: album, pos_id: 1 }
  return encodeRecord('a202', JSON.stringify({ state: 0, playerflag: flag, song: JSON.stringify(song) }))
}

async function open(onRecord: (data: string) => string[]) {
  const socket = new Socket((data) => (data === '0599000C0000' ? [encodeRecord('a599', '0306')] : onRecord(data)))
  const { session } = await GatewaySession.open('ws://x', () => {
    queueMicrotask(() => {
      socket.readyState = 1
      socket.emit('open')
    })
    return socket
  })
  session.pair('1234567890ABCD')
  return { socket, session }
}

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(() => vi.useRealTimers())

describe('stock catalog pages', () => {
  it('encodes named headers for the firmware buffer', () => {
    expect(nameHeader('Тихий океан')).toBe('%D0%A2%D0%B8%D1%85%D0%B8%D0%B9%20%D0%BE%D0%BA%D0%B5%D0%B0%D0%BD')
    expect(() => nameHeader(' padded')).toThrow(RangeError)
    expect(() => nameHeader('Я'.repeat(43))).toThrow(RangeError)
  })

  it('refuses an empty 200 without total-num', async () => {
    const empty = new GatewayHttp(() => Promise.resolve(new Response('')))
    await expect(catalogPage(empty, 'album/song', { album: ALBUM }, 0, 1)).rejects.toThrow(SyntaxError)
  })
})

describe('guarded album selection', () => {
  it('reads membership twice, preflights, sends once and confirms with a fresh read', async () => {
    const { http: gateway, calls } = http(() => ({ rows: ROWS, total: 2 }))
    const { socket, session } = await open((data) => (data === '02020008' ? [playing(ALBUM, 'Волны')] : []))
    const outcome = await selectAlbum({ session, http: gateway, timeoutMs: 4000, pauseMs: 1 }, ALBUM)
    expect(outcome).toBe('playing')
    expect(calls.map((c) => [c['start-pos'], c['num-max']])).toEqual([
      ['0', '200'],
      ['0', '200'],
      ['0', '1'],
    ])
    const selections = socket.sent.filter((data) => data.startsWith('0101'))
    expect(selections).toEqual([encodeRecord('0101', `0003${ALBUM}`)])
    expect(socket.sent[socket.sent.indexOf(selections[0] ?? '') - 1]).toMatch(/^request:/)
  })

  it('does not send when the membership changes between reads', async () => {
    let read = 0
    const { http: gateway } = http(() =>
      ++read === 2 ? { rows: ROWS.slice(0, 1), total: 1 } : { rows: ROWS, total: 2 },
    )
    const { socket, session } = await open(() => [])
    expect(await selectAlbum({ session, http: gateway, timeoutMs: 4000 }, ALBUM)).toBe('changed')
    expect(socket.sent.some((data) => data.startsWith('0101'))).toBe(false)
  })

  it('reports uncertain, without retrying, when playback never confirms the album', async () => {
    const { http: gateway } = http(() => ({ rows: ROWS, total: 2 }))
    const { socket, session } = await open((data) => (data === '02020008' ? [playing('Другой', 'Волны')] : []))
    let now = 0
    const outcome = selectAlbum(
      {
        session,
        http: gateway,
        timeoutMs: 4000,
        confirmMs: 100,
        now: () => now,
        sleep: () => ((now += 50), Promise.resolve()),
      },
      ALBUM,
    )
    await vi.runAllTimersAsync()
    expect(await outcome).toBe('uncertain')
    expect(socket.sent.filter((data) => data.startsWith('0101'))).toHaveLength(1)
  })

  it('selects one album track by its unique stock position (0100 with 0003)', async () => {
    const { http: gateway } = http(() => ({ rows: ROWS, total: 2 }))
    const { socket, session } = await open((data) => (data === '02020008' ? [playing(ALBUM, 'Тихий океан')] : []))
    const outcome = await selectSource(
      { session, http: gateway, timeoutMs: 4000, pauseMs: 1 },
      { kind: 'album', album: ALBUM, track: { title: 'Тихий океан', artist: 'Берег' } },
    )
    expect(outcome).toBe('playing')
    expect(socket.sent.filter((data) => data.startsWith('0100'))).toEqual([encodeRecord('0100', `00010003${ALBUM}`)])
  })

  it("plays one artist's release of a shared title with the type-7 selector", async () => {
    const { http: gateway, calls } = http(() => ({ rows: ROWS, total: 2 }))
    const { socket, session } = await open((data) => (data === '02020008' ? [playing(ALBUM, 'Тихий океан', 7)] : []))
    const outcome = await selectSource(
      { session, http: gateway, timeoutMs: 4000, pauseMs: 1 },
      { kind: 'artistAlbum', artist: 'Берег', album: ALBUM, track: { title: 'Тихий океан', artist: 'Берег' } },
    )
    expect(outcome).toBe('playing')
    expect(calls[0]?.type).toBe('artist/album/song')
    expect(calls[0]?.artist).toBe(nameHeader('Берег'))
    expect(calls[0]?.album).toBe(nameHeader(ALBUM))
    expect(socket.sent.filter((data) => data.startsWith('0100'))).toEqual([
      encodeRecord('0100', `00010007{"artist":"Берег", "album":"${ALBUM}"}`),
    ])
  })

  it('does not confirm a scoped release from the whole title group or another artist', async () => {
    const { http: gateway } = http(() => ({ rows: ROWS, total: 2 }))
    const { session } = await open((data) => (data === '02020008' ? [playing(ALBUM, 'Волны', 3)] : []))
    let now = 0
    const outcome = selectSource(
      {
        session,
        http: gateway,
        timeoutMs: 4000,
        confirmMs: 100,
        now: () => now,
        sleep: () => ((now += 50), Promise.resolve()),
      },
      { kind: 'artistAlbum', artist: 'Берег', album: ALBUM },
    )
    await vi.runAllTimersAsync()
    expect(await outcome).toBe('uncertain')
  })

  it('refuses type-7 names the stock sscanf cannot carry, before any read', async () => {
    expect(artistAlbumSelector('A "B"', 'X')).toBeNull()
    expect(artistAlbumSelector('A', 'back\\slash')).toBeNull()
    expect(artistAlbumSelector('unknown_artist', 'X')).toBeNull()
    expect(artistAlbumSelector('A', 'X')).toBe('{"artist":"A", "album":"X"}')
    const { http: gateway, calls } = http(() => ({ rows: ROWS, total: 2 }))
    const { socket, session } = await open(() => [])
    const outcome = await selectSource(
      { session, http: gateway, timeoutMs: 4000 },
      { kind: 'artistAlbum', artist: 'A "B"', album: ALBUM },
    )
    expect(outcome).toBe('unavailable')
    expect(calls).toHaveLength(0)
    expect(socket.sent.some((data) => data.startsWith('0101'))).toBe(false)
  })

  it('plays a whole genre with type 8 and an empty album, confirmed by playerflag 8', async () => {
    const { http: gateway, calls } = http(() => ({ rows: ROWS, total: 2 }))
    const { socket, session } = await open((data) => (data === '02020008' ? [playing(ALBUM, 'Волны', 8)] : []))
    const outcome = await selectSource(
      { session, http: gateway, timeoutMs: 4000, pauseMs: 1 },
      { kind: 'genre', genre: 'Indie' },
    )
    expect(outcome).toBe('playing')
    expect(calls[0]?.type).toBe('style/song')
    expect(calls[0]?.style).toBe('Indie')
    expect(socket.sent.filter((data) => data.startsWith('0101'))).toEqual([
      encodeRecord('0101', '0008{"style":"Indie", "album":""}'),
    ])
  })

  it('selects a track in a whole genre with type 000A, confirmed by playerflag 10', async () => {
    const { http: gateway } = http(() => ({ rows: ROWS, total: 2 }))
    const { socket, session } = await open((data) => (data === '02020008' ? [playing(ALBUM, 'Тихий океан', 10)] : []))
    const outcome = await selectSource(
      { session, http: gateway, timeoutMs: 4000, pauseMs: 1 },
      { kind: 'genre', genre: 'Indie', track: { title: 'Тихий океан', artist: 'Берег' } },
    )
    expect(outcome).toBe('playing')
    expect(socket.sent.filter((data) => data.startsWith('0100'))).toEqual([encodeRecord('0100', '0001000AIndie')])
  })

  it('narrows a genre to an album with the type-8 selector', async () => {
    const { http: gateway, calls } = http(() => ({ rows: ROWS, total: 2 }))
    const { socket, session } = await open((data) => (data === '02020008' ? [playing(ALBUM, 'Тихий океан', 8)] : []))
    const outcome = await selectSource(
      { session, http: gateway, timeoutMs: 4000, pauseMs: 1 },
      { kind: 'genreAlbum', genre: 'Indie', album: ALBUM, track: { title: 'Тихий океан', artist: 'Берег' } },
    )
    expect(outcome).toBe('playing')
    expect(calls[0]?.type).toBe('style/album/song')
    expect(socket.sent.filter((data) => data.startsWith('0100'))).toEqual([
      encodeRecord('0100', `00010008{"style":"Indie", "album":"${ALBUM}"}`),
    ])
  })

  it('accepts a shortened album name only when one name of the scope starts with it', async () => {
    const albums = (names: string[]) => names.map((name) => ({ name, author: null }))
    const run = async (names: string[]) => {
      const impl = (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = init?.headers as Record<string, string>
        const rows = headers.type === 'album' ? albums(names) : ROWS
        const start = Number(headers['start-pos'])
        const body = JSON.stringify(rows.slice(start, start + Number(headers['num-max'])))
        return Promise.resolve(new Response(body, { headers: { 'total-num': String(rows.length) } }))
      }
      const { session } = await open((data) => (data === '02020008' ? [playing('Тихий ок', 'Волны')] : []))
      let now = 0
      const outcome = selectAlbum(
        {
          session,
          http: new GatewayHttp(impl),
          timeoutMs: 4000,
          confirmMs: 100,
          now: () => now,
          sleep: () => ((now += 50), Promise.resolve()),
        },
        ALBUM,
      )
      await vi.runAllTimersAsync()
      return outcome
    }
    expect(await run([ALBUM, 'Другой'])).toBe('playing')
    expect(await run([ALBUM, 'Тихий океан II'])).toBe('uncertain')
  })

  it('plays all of one artist with the empty-album type-7 form, confirmed by artist and playerflag 7', async () => {
    const { http: gateway, calls } = http(() => ({ rows: ROWS, total: 2 }))
    const { socket, session } = await open((data) => (data === '02020008' ? [playing(ALBUM, 'Волны', 7)] : []))
    const outcome = await selectSource(
      { session, http: gateway, timeoutMs: 4000, pauseMs: 1 },
      { kind: 'artist', artist: 'Берег' },
    )
    expect(outcome).toBe('playing')
    expect(calls[0]?.type).toBe('artist/song')
    expect(socket.sent.filter((data) => data.startsWith('0101'))).toEqual([
      encodeRecord('0101', '0007{"artist":"Берег", "album":""}'),
    ])
  })

  it('refuses reserved or unscannable genre names before any read', async () => {
    const { http: gateway, calls } = http(() => ({ rows: ROWS, total: 2 }))
    const { session } = await open(() => [])
    const deps = { session, http: gateway, timeoutMs: 4000 }
    expect(await selectSource(deps, { kind: 'genre', genre: 'unknown_style' })).toBe('unavailable')
    expect(await selectSource(deps, { kind: 'genreAlbum', genre: 'Rock "n" Roll', album: ALBUM })).toBe('unavailable')
    expect(calls).toHaveLength(0)
  })

  it('refuses a track that is ambiguous or missing in the stock order', async () => {
    const twice = [...ROWS, { name: 'Волны', author: 'Берег' }]
    const { http: gateway } = http(() => ({ rows: twice, total: 3 }))
    const { socket, session } = await open(() => [])
    const deps = { session, http: gateway, timeoutMs: 4000 }
    expect(await selectSource(deps, { kind: 'library', track: { title: 'Волны', artist: 'Берег' } })).toBe('ambiguous')
    expect(await selectSource(deps, { kind: 'library', track: { title: 'Нет', artist: 'Берег' } })).toBe('changed')
    expect(socket.sent.some((data) => data.startsWith('0100'))).toBe(false)
  })

  it('never sends without pairing', async () => {
    const { http: gateway } = http(() => ({ rows: ROWS, total: 2 }))
    const socket = new Socket((data) => (data === '0599000C0000' ? [encodeRecord('a599', '0306')] : []))
    const { session } = await GatewaySession.open('ws://x', () => {
      queueMicrotask(() => {
        socket.readyState = 1
        socket.emit('open')
      })
      return socket
    })
    expect(await selectAlbum({ session, http: gateway, timeoutMs: 4000 }, ALBUM)).toBe('unavailable')
    expect(socket.sent.some((data) => data.startsWith('0101'))).toBe(false)
  })
})

describe('queue observation', () => {
  it('needs two equal reads with a stable mark', async () => {
    const queueFetch = (rows: typeof ROWS, mark: () => number) =>
      new GatewayHttp((_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = init?.headers as Record<string, string>
        const start = Number(headers['start-pos'])
        const body = JSON.stringify(rows.slice(start, start + Number(headers['num-max'])))
        return Promise.resolve(
          new Response(body, { headers: { 'total-num': String(rows.length), 'mark-pos': String(mark()) } }),
        )
      })
    expect(await readQueue(queueFetch(ROWS, () => 1))).toEqual({ items: ROWS, current: 1 })
    let calls = 0
    await expect(readQueue(queueFetch(ROWS, () => (++calls > 2 ? 0 : 1)))).rejects.toThrow('changed')
  })
})

describe('folder playback (0101/0100 with 0004)', () => {
  const FOLDER = '/tmp/sdcard/Берег - Тихий океан'
  const LISTING = [
    { pos: 0, is_dir: true, name: 'Scans' },
    { pos: 1, is_dir: false, name: 'cover.jpg', is_image: true },
    { pos: 2, is_dir: false, name: '01 Волны.flac' },
    { pos: 3, is_dir: false, name: '02 Тихий океан.flac' },
  ]
  function folderHttp(listing: () => typeof LISTING) {
    const urls: string[] = []
    const impl = (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input.toString()
      urls.push(url)
      const rows = listing()
      return Promise.resolve(new Response(JSON.stringify(rows), { headers: { 'total-num': String(rows.length) } }))
    }
    return { http: new GatewayHttp(impl), urls }
  }
  const playingFile = (name: string, flag = 4) =>
    encodeRecord(
      'a202',
      JSON.stringify({
        state: 0,
        playerflag: flag,
        song: JSON.stringify({ song_name: name, song_file_path: `${FOLDER}/${name}`, pos_id: 1 }),
      }),
    )

  it('plays a folder from its first audio file, past subfolders and covers', async () => {
    const { http: gateway, urls } = folderHttp(() => LISTING)
    const { socket, session } = await open((data) => (data === '02020008' ? [playingFile('01 Волны.flac')] : []))
    const outcome = await selectSource(
      { session, http: gateway, timeoutMs: 4000, pauseMs: 1 },
      { kind: 'folder', folder: 'Берег - Тихий океан' },
    )
    expect(outcome).toBe('playing')
    expect(urls[0]).toBe(
      '/api/stock/localdir/tmp/sdcard/%D0%91%D0%B5%D1%80%D0%B5%D0%B3%20-%20%D0%A2%D0%B8%D1%85%D0%B8%D0%B9%20%D0%BE%D0%BA%D0%B5%D0%B0%D0%BD/',
    )
    expect(socket.sent.filter((data) => data.startsWith('0101'))).toEqual([encodeRecord('0101', `0004${FOLDER}`)])
  })

  it('plays one file by its position in the playback browser, subfolders counted', async () => {
    const { http: gateway } = folderHttp(() => LISTING)
    const { socket, session } = await open((data) => (data === '02020008' ? [playingFile('02 Тихий океан.flac')] : []))
    const outcome = await selectSource(
      { session, http: gateway, timeoutMs: 4000, pauseMs: 1 },
      { kind: 'folder', folder: 'Берег - Тихий океан', file: '02 Тихий океан.flac' },
    )
    expect(outcome).toBe('playing')
    expect(socket.sent.filter((data) => data.startsWith('0100'))).toEqual([encodeRecord('0100', `00030004${FOLDER}`)])
  })

  it('sends nothing for a cover, a missing file or a folder that changes while it is read', async () => {
    const { http: gateway } = folderHttp(() => LISTING)
    const { socket, session } = await open(() => [])
    const deps = { session, http: gateway, timeoutMs: 4000, pauseMs: 1 }
    expect(await selectSource(deps, { kind: 'folder', folder: 'Берег - Тихий океан', file: 'cover.jpg' })).toBe(
      'changed',
    )
    expect(await selectSource(deps, { kind: 'folder', folder: 'Берег - Тихий океан', file: 'gone.flac' })).toBe(
      'changed',
    )
    let reads = 0
    const moving = folderHttp(() => (++reads === 2 ? LISTING.slice(1) : LISTING)).http
    expect(await selectSource({ ...deps, http: moving }, { kind: 'folder', folder: 'Берег - Тихий океан' })).toBe(
      'changed',
    )
    // Stock treats any .m3u in the path as a playlist.
    expect(await selectSource(deps, { kind: 'folder', folder: 'lists.m3u.d' })).toBe('unavailable')
    expect(socket.sent.filter((data) => data.startsWith('010'))).toEqual([])
  })
})
