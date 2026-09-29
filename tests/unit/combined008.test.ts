import { describe, expect, it } from 'vitest'
import { parseAbout } from '../../src/domain/about'
import { dislikedKey, dislikedKeyFields, dislikedRecord, isDislikedKey } from '../../src/domain/disliked'
import { entryFolder, entryName, parseLeftovers, parseTrash } from '../../src/domain/trash'
import { listFolder } from '../../src/gateway/files'
import { queueData } from '../../src/gateway/library'
import { GatewayHttp } from '../../src/gateway/http'
import { audioUrl } from '../../src/gateway/media'
import { deleteRecord, putRecord, readCollection } from '../../src/gateway/store'
import { moveToTrash, readTrash } from '../../src/gateway/trash'

/** A fetch that answers from a list of scripted replies and records what was asked. */
function scripted(replies: { status: number; body: unknown }[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const fetchImpl = (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: input instanceof Request ? input.url : input.toString(), init })
    const reply = replies.shift() ?? { status: 500, body: 'no reply' }
    const text = typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body)
    return Promise.resolve(new Response(text, { status: reply.status }))
  }
  return { http: new GatewayHttp(fetchImpl, () => Promise.resolve()), calls }
}

describe('disliked tracks on the store', () => {
  it('keys a whole file by its path and a CUE track by path and title', () => {
    const file = { path: '/tmp/sdcard/A/a.flac', title: 'A', cue: false, artist: 'X', album: 'Y' }
    const cue = { path: '/tmp/sdcard/L/Image.flac', title: ' Part Two ', cue: true, artist: null, album: null }
    expect(dislikedRecord(file, 5)).toEqual({ path: file.path, artist: 'X', album: 'Y', at: 5 })
    expect(dislikedRecord(cue, 5)).toEqual({ path: cue.path, title: 'Part Two', at: 5 })
    expect(dislikedKeyFields(cue)).toEqual({ path: cue.path, title: 'Part Two' })
    expect(dislikedKeyFields(file)).toEqual({ path: file.path })
    const keys = new Set([dislikedKey({ path: cue.path, title: 'Part Two' }), dislikedKey({ path: file.path })])
    expect(isDislikedKey(keys, file)).toBe(true)
    expect(isDislikedKey(keys, { ...cue, title: 'Part Two' })).toBe(true)
    expect(isDislikedKey(keys, { ...cue, title: 'Part One' })).toBe(false)
    expect(dislikedRecord({ ...file, path: null }, 1)).toBeNull()
  })

  it('reads every page of a collection and treats a missing store as unavailable', async () => {
    const record = (n: number) => ({
      key: [`/p${String(n)}`, null],
      value: { path: `/p${String(n)}`, at: n },
      updated: n,
    })
    const { http, calls } = scripted([
      { status: 200, body: { records: [record(1), record(2)], total: 3, offset: 0, truncated: true } },
      { status: 200, body: { records: [record(3)], total: 3, offset: 500, truncated: false } },
    ])
    const records = await readCollection<{ path: string }>(http, 'disliked')
    expect(records?.map((r) => r.value.path)).toEqual(['/p1', '/p2', '/p3'])
    expect(calls.map((call) => call.url)).toEqual([
      '/api/store/disliked/records?limit=500&offset=0',
      '/api/store/disliked/records?limit=500&offset=500',
    ])
    expect(
      await readCollection(scripted([{ status: 403, body: 'No reviewed store catalog' }]).http, 'disliked'),
    ).toBeNull()
    expect(await readCollection(scripted([{ status: 404, body: 'No database' }]).http, 'disliked')).toBeNull()
  })

  it('changes a record with the serial number and a fresh request ID, and names the outcome', async () => {
    const { http, calls } = scripted([
      { status: 200, body: { created: true } },
      { status: 409, body: 'The collection is full\n' },
      { status: 200, body: { deleted: true } },
      { status: 503, body: 'Store unavailable\n' },
    ])
    expect(await putRecord(http, 'disliked', { path: '/p', at: 1 }, '00000000000000')).toBe('confirmed')
    expect(await putRecord(http, 'disliked', { path: '/q', at: 1 }, '00000000000000')).toBe('full')
    expect(await deleteRecord(http, 'disliked', { path: '/p/ё', title: 'Part 2' }, '00000000000000')).toBe('confirmed')
    expect(await deleteRecord(http, 'disliked', { path: '/p' }, '00000000000000')).toBe('uncertain')
    const put = calls[0]?.init
    expect(put?.method).toBe('PUT')
    expect((put?.headers as Record<string, string>)['X-Disc-Token']).toBe('00000000000000')
    expect((put?.headers as Record<string, string>)['X-Disc-Request']).toMatch(/^[A-Za-z0-9_-]{16,64}$/)
    expect(JSON.parse(put?.body as string)).toEqual({ path: '/p', at: 1 })
    expect(calls[2]?.url).toBe('/api/store/disliked/record?path=%2Fp%2F%D1%91&title=Part+2')
  })
})

describe('the trash and macOS leftovers', () => {
  it('parses entries, names them and tells where they came from', () => {
    const listing = parseTrash({
      entries: [
        { id: 3, path: '/tmp/sdcard', kind: 'leftovers', bytes: 10, files: 4, trashed: 5, complete: true },
        { id: 2, path: '/tmp/sdcard/Album/a.flac', kind: 'file', bytes: 7, files: 1, trashed: 4, complete: false },
        { id: 'x', path: 1 },
      ],
      count: 2,
      bytes: 17,
      truncated: false,
    })
    expect(listing?.entries.map((entry) => [entry.id, entry.kind, entry.complete])).toEqual([
      [3, 'leftovers', true],
      [2, 'file', false],
    ])
    const [leftovers, file] = listing?.entries ?? []
    expect(leftovers && entryName(leftovers)).toBeNull()
    expect(file && [entryName(file), entryFolder(file, '/tmp/sdcard')]).toEqual(['a.flac', 'Album'])
    expect(parseTrash({ nothing: true })).toBeNull()
    expect(
      parseLeftovers({
        files: 2,
        bytes: 9,
        items: [{ path: '/tmp/sdcard/.Trashes', kind: 'folder', files: 1, bytes: 5 }],
      })?.items,
    ).toEqual([{ path: '/tmp/sdcard/.Trashes', kind: 'folder', files: 1, bytes: 5 }])
  })

  it('moves with the serial number and passes the service reason on', async () => {
    const { http, calls } = scripted([
      { status: 409, body: 'The player has it open\n' },
      { status: 200, body: { entries: [], count: 0, bytes: 0, truncated: false } },
    ])
    const reply = await moveToTrash(http, '/tmp/sdcard/Album', '00000000000000')
    expect([reply.status, reply.problem]).toEqual([409, 'The player has it open'])
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({ path: '/tmp/sdcard/Album' })
    expect((await readTrash(http))?.count).toBe(0)
  })
})

describe("stock's folder listing after the service changed the card", () => {
  it('lists the service folder first when asked for a fresh listing, so stock reads the card again', async () => {
    const { http, calls } = scripted([
      { status: 200, body: [{ pos: 0, is_dir: true, name: 'trash' }] },
      { status: 200, body: [{ pos: 0, is_dir: true, name: 'Album', is_cue: false, is_m3u: false, is_image: false }] },
      { status: 200, body: [{ pos: 0, is_dir: true, name: 'Album', is_cue: false, is_m3u: false, is_image: false }] },
    ])
    const fresh = await listFolder(http, 'Music', true)
    expect(fresh.entries.map((entry) => entry.name)).toEqual(['Album'])
    await listFolder(http, 'Music')
    expect(calls.map((call) => call.url)).toEqual([
      '/api/stock/dir/tmp/sdcard/.disc/',
      '/api/stock/dir/tmp/sdcard/Music/',
      '/api/stock/dir/tmp/sdcard/Music/',
    ])
  })
})

describe("stock's queue when a scan dropped it", () => {
  const result = (columns: string[], rows: unknown[][]) => ({
    status: 200,
    body: { query: 'q', columns, rows, rows_returned: rows.length, truncated: false },
  })
  it('reads the queue only while stock has its table, and directly with an older catalog', async () => {
    const gone = scripted([result(['present'], [[0]])])
    expect(await queueData(gone.http)).toBeNull()
    expect(gone.calls.map((call) => call.url)).toEqual(['/api/data/queue_state'])
    const there = scripted([result(['present'], [[1]]), result(['ID', 'PATH'], [[1, '/tmp/sdcard/a.flac']])])
    expect((await queueData(there.http))?.rows).toEqual([[1, '/tmp/sdcard/a.flac']])
    const older = scripted([
      { status: 404, body: 'Unknown query\n' },
      result(['ID', 'PATH'], [[1, '/tmp/sdcard/a.flac']]),
    ])
    expect((await queueData(older.http))?.rows_returned).toBe(1)
    expect(older.calls.map((call) => call.url)).toEqual(['/api/data/queue_state', '/api/data/queue'])
  })
})

describe('diagnostics and the audio route', () => {
  it('reads the about document and ignores what it does not know', () => {
    const about = parseAbout({
      service: { version: '0.9.0', build: 'abc', uptime: 9, supervised: true },
      image: {
        variant: 'usb-engineering',
        firmwareVersion: '2.57',
        app: { name: 'Disc Player', version: '2026.09.29' },
      },
      page: { source: 'image', app: 'Disc Player', version: '2026.09.29' },
      card: { owned: true },
      database: { state: 'ok', schema: 4, bytes: 1, plays: 2, records: 3, trash: 0 },
      restarts: ['1 restarted after signal 11', 5],
      log: [{ t: 1, m: 'Skip rule: skipped to the next track' }, { t: 2 }],
      future: {},
    })
    // combined-009: the default app and its version (app.json).
    expect(about?.page).toEqual({ source: 'image', version: '2026.09.29' })
    expect(about?.restarts).toEqual(['1 restarted after signal 11'])
    expect(about?.log).toEqual([{ at: 1, message: 'Skip rule: skipped to the next track' }])
    expect(parseAbout({ nothing: true })).toBeNull()
  })

  it('addresses a card file for the browser, each component encoded', () => {
    expect(audioUrl('/tmp/sdcard/Ёж Album/01 #1?.flac')).toBe(
      '/api/media/audio/tmp/sdcard/%D0%81%D0%B6%20Album/01%20%231%3F.flac',
    )
  })
})
