import { describe, expect, it } from 'vitest'
import { parseAbout } from '../../src/domain/about'
import { pathsHash, playCounts, queueContext } from '../../src/domain/history'
import { readCardFolder, readCardTree } from '../../src/gateway/card'
import { createFolder, listFolder } from '../../src/gateway/files'
import { GatewayHttp } from '../../src/gateway/http'

const fake = (handle: (url: string, init?: RequestInit) => Response) =>
  new GatewayHttp((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handle(input instanceof Request ? input.url : input.toString(), init)),
  )
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

describe('the card in one request (combined-009)', () => {
  it('lists a folder through the service with kinds and sizes, each part encoded', async () => {
    const seen: string[] = []
    const http = fake((url) => {
      seen.push(url)
      return json({
        path: 'Музыка/A B',
        entries: [
          { name: 'CD1', dir: true, modified: 1 },
          { name: 'a.flac', dir: false, kind: 'audio', bytes: 1200, modified: 1 },
          { name: 'cover.jpg', dir: false, kind: 'image', bytes: 30, modified: 1 },
          { name: 'a.lrc', dir: false, kind: 'lyrics', bytes: 9, modified: 1 },
          { name: 'x.m3u', dir: false, kind: 'playlist', bytes: 9, modified: 1 },
          { name: 'notes.txt', dir: false, kind: 'strange', bytes: 5, modified: 1 },
          { name: 'bad/name', dir: false, kind: 'audio', bytes: 5, modified: 1 },
        ],
        count: 7,
        truncated: false,
      })
    })
    const folder = await readCardFolder(http, 'Музыка/A B')
    expect(seen).toEqual(['/api/card/folder/%D0%9C%D1%83%D0%B7%D1%8B%D0%BA%D0%B0/A%20B'])
    expect(folder?.entries.map((entry) => [entry.name, entry.folder, entry.kind, entry.bytes])).toEqual([
      ['CD1', true, null, null],
      ['a.flac', false, 'audio', 1200],
      ['cover.jpg', false, 'image', 30],
      ['a.lrc', false, 'lyrics', 9],
      ['x.m3u', false, 'playlist', 9],
      ['notes.txt', false, 'other', 5],
    ])
    expect(folder?.entries[2]?.image).toBe(true)
    expect(folder?.entries[4]?.playlist).toBe(true)
  })

  it('lists through the service on combined-009 (a missing folder is empty) and through stock before it', async () => {
    const seen: string[] = []
    const http = fake((url) => {
      seen.push(url)
      if (url.startsWith('/api/card/folder')) return new Response('No such folder\n', { status: 404 })
      return new Response('', { status: 200 })
    })
    expect(await listFolder(http, 'Gone', false, true)).toEqual({ entries: [], total: null, truncated: false })
    expect(seen).toEqual(['/api/card/folder/Gone'])
    await listFolder(http, 'Gone', true)
    expect(seen.slice(1)).toEqual(['/api/stock/dir/tmp/sdcard/.disc/', '/api/stock/dir/tmp/sdcard/Gone/'])
  })

  it('confirms a new folder through the service listing on combined-009', async () => {
    const calls: string[] = []
    const http = fake((url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (init?.method === 'POST') return new Response('', { status: 200, headers: { 'is-exist': '0' } })
      return json({ entries: [{ name: 'New', dir: true, modified: 1 }], count: 1, truncated: false })
    })
    expect(await createFolder(http, 'SN', 'Music', 'New', true)).toBe('created')
    expect(calls).toEqual(['POST /api/stock/dir/tmp/sdcard/Music/New', 'GET /api/card/folder/Music'])
  })

  it('reads the whole tree: card paths, audio facts, a year as the tags give it', async () => {
    const http = fake(() =>
      json({
        root: '/tmp/sdcard',
        path: '',
        entries: [
          { path: 'A', dir: true, modified: 1 },
          {
            path: 'A/1.flac',
            bytes: 2000,
            modified: 1,
            kind: 'audio',
            format: 'flac',
            sampleRate: 96000,
            bitDepth: 24,
            channels: 2,
            bitRate: null,
            durationMs: 180000,
            year: '2004',
          },
          {
            path: 'A/2.aac',
            bytes: 900,
            modified: 1,
            kind: 'audio',
            format: 'aac',
            sampleRate: 44100,
            bitDepth: null,
            channels: 2,
            bitRate: 256000,
            durationMs: null,
            year: null,
          },
          { path: 'A/cover.jpg', bytes: 40, modified: 1, kind: 'image' },
        ],
        folders: 1,
        files: 3,
        bytes: 2940,
        truncated: false,
        elapsedMs: 4,
      }),
    )
    const tree = await readCardTree(http)
    expect(tree?.files.map((file) => file.path)).toEqual([
      '/tmp/sdcard/A/1.flac',
      '/tmp/sdcard/A/2.aac',
      '/tmp/sdcard/A/cover.jpg',
    ])
    expect(tree?.files[0]?.audio).toEqual({
      bytes: 2000,
      format: 'flac',
      sampleRate: 96000,
      bitDepth: 24,
      bitRate: null,
      channels: 2,
      durationMs: 180000,
      year: 2004,
    })
    expect(tree?.files[1]?.audio).toMatchObject({ format: 'aac', bitRate: 256000, durationMs: null, year: null })
    expect(tree?.files[2]?.audio).toBeNull()
    expect(tree).toMatchObject({ folders: 1, bytes: 2940, truncated: false })
  })

  it('answers null where the image has no such routes', async () => {
    const http = fake(() => new Response('Not found\n', { status: 404 }))
    expect(await readCardTree(http)).toBeNull()
    expect(await readCardFolder(http, '')).toBeNull()
  })
})

describe('plays in this browser (combined-009)', () => {
  it("counts a play by the observer's rule", () => {
    expect(playCounts(29_999, null)).toBe(false)
    expect(playCounts(30_000, null)).toBe(true)
    expect(playCounts(15_000, 30_000)).toBe(true)
    expect(playCounts(14_999, 30_000)).toBe(false)
    // Half of a short track counts only after 5 s.
    expect(playCounts(4_000, 8_000)).toBe(false)
    expect(playCounts(5_000, 8_000)).toBe(true)
    expect(playCounts(10_000, 0)).toBe(false)
  })

  it('describes the queue as the observer does, so Recently played names it', () => {
    const paths = ['/tmp/sdcard/A/1.flac', '/tmp/sdcard/A/2.flac']
    expect(queueContext(paths, { type: 3, album: 'A', artist: 'X' })).toEqual({
      type: 3,
      count: 2,
      hash: pathsHash(paths),
      album: 'A',
      artist: 'X',
      genre: null,
      folder: null,
    })
    expect(queueContext([], { type: null })).toMatchObject({ count: 0, hash: null, album: null })
  })
})

describe('history write diagnostics (combined-009)', () => {
  const about = (writes: unknown) => ({
    service: { version: '0.9.0', build: 'b' },
    page: { source: 'card' },
    database: { state: 'ok', schema: 5, plays: 3, records: 0, trash: 0, writes },
  })
  it('reads how many plays could not be written and why', () => {
    expect(
      parseAbout(about({ failed: 2, lastFailure: 20, lastSuccess: 10, reason: 'card full' }))?.database?.writes,
    ).toEqual({ failed: 2, lastFailure: 20, lastSuccess: 10, reason: 'card full' })
    expect(parseAbout(about(undefined))?.database?.writes).toBeNull()
  })
})
