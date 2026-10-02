import { describe, expect, it } from 'vitest'
import {
  breadcrumbs,
  cardFolder,
  folderNameProblem,
  folderStats,
  joinFolder,
  relativeFolder,
  sortEntries,
  visibleEntries,
  type FolderEntry,
} from '../../src/domain/files'
import type { LibraryTrack } from '../../src/domain/track'
import { createFolder, listFolder } from '../../src/gateway/files'
import { GatewayHttp } from '../../src/gateway/http'

const entry = (name: string, folder = false): FolderEntry => ({
  name,
  folder,
  image: false,
  cue: false,
  playlist: false,
})

let nextId = 1
const track = (path: string, album: string | null, rest: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: nextId++,
  title: path.split('/').at(-1) ?? path,
  artist: 'A',
  album,
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

describe('card folders', () => {
  it('addresses folders from the card root', () => {
    expect(cardFolder('')).toBe('/tmp/sdcard/')
    expect(cardFolder('/Linkin Park//CD1/')).toBe('/tmp/sdcard/Linkin Park/CD1/')
    expect(relativeFolder('/tmp/sdcard/Linkin Park/CD1')).toBe('Linkin Park/CD1')
    expect(relativeFolder('/elsewhere')).toBe('')
    expect(joinFolder('', 'New')).toBe('New')
    expect(joinFolder('A/B', 'C')).toBe('A/B/C')
    expect(breadcrumbs('A/B')).toEqual([
      { name: null, folder: '' },
      { name: 'A', folder: 'A' },
      { name: 'B', folder: 'A/B' },
    ])
  })

  it('refuses folder names FAT, the service or the page keep for themselves', () => {
    expect(folderNameProblem('Guano Apes', '')).toBeNull()
    expect(folderNameProblem('Диск 2', 'Альбом')).toBeNull()
    expect(folderNameProblem('   ', '')).toBe('empty')
    for (const name of ['a/b', 'a\\b', 'x:y', 'what?', 'trailing.', ' lead', 'tab\tname', '..'])
      expect(folderNameProblem(name, '')).toBe('invalid')
    expect(folderNameProblem('.hidden', '')).toBe('reserved')
    expect(visibleEntries([entry('.disc', true), entry('Music', true), entry('._a.flac')]).map((e) => e.name)).toEqual([
      'Music',
    ])
    // combined-008: only hidden names are the service's; DISC_WEB… and www are ordinary names now.
    expect(folderNameProblem('DISC_WEB_X', '')).toBeNull()
    expect(folderNameProblem('www', '')).toBeNull()
    expect(folderNameProblem('www', '.disc')).toBe('reserved')
    // The apps' folder (this page lives there) is neither shown at the root nor made or filled.
    expect(folderNameProblem('Apps', '')).toBe('reserved')
    expect(folderNameProblem('New', 'apps/Disc Player')).toBe('reserved')
    expect(folderNameProblem('Apps', 'Music')).toBeNull()
    expect(
      visibleEntries([entry('Apps', true), entry('Music', true), entry('Apps.flac')]).map((item) => item.name),
    ).toEqual(['Music', 'Apps.flac'])
    expect(visibleEntries([entry('Apps', true)], 'Music').map((item) => item.name)).toEqual(['Apps'])
    // Nothing is created inside the page release or the service's folders either.
    expect(folderNameProblem('assets', 'www')).toBeNull()
    expect(folderNameProblem('x', 'DISC_WEB_HISTORY')).toBeNull()
    expect(folderNameProblem('www', 'Music')).toBeNull()
  })

  it('lists folders first, then names in the locale order with numbers compared as numbers', () => {
    const sorted = sortEntries(
      [entry('b.flac'), entry('Z', true), entry('10 x.flac'), entry('2 x.flac'), entry('a', true)],
      'en',
    )
    expect(sorted.map((item) => item.name)).toEqual(['a', 'Z', '2 x.flac', '10 x.flac', 'b.flac'])
  })

  it('sums what the library knows below a folder, a CUE image once', () => {
    const image = '/tmp/sdcard/Best/Image.flac'
    const tracks = [
      track(image, 'Best', { cue: true }),
      track(image, 'Best', { cue: true }),
      track('/tmp/sdcard/Best/Bonus/x.flac', 'Best'),
      track('/tmp/sdcard/Bestest/y.flac', 'Other'),
    ]
    const files = { [image]: { bytes: 300, format: 'flac', sampleRate: 44100, bitDepth: 16, bitRate: null } }
    expect(folderStats(tracks, files, 'Best')).toEqual({ tracks: 3, bytes: 300, files: 2, measured: 1, album: 'Best' })
    // A sibling whose name starts the same is not inside.
    expect(folderStats(tracks, files, '').album).toBeNull()
    expect(folderStats(tracks, files, 'Nowhere')).toEqual({ tracks: 0, bytes: 0, files: 0, measured: 0, album: null })
  })
})

/** A gateway whose fetch answers synchronously from a handler of the URL. */
const fake = (handle: (url: string, init?: RequestInit) => Response) =>
  new GatewayHttp((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handle(input instanceof Request ? input.url : input.toString(), init)),
  )

describe('folder gateway', () => {
  it('pages through stock listings and treats an empty 200 as an empty folder', async () => {
    const seen: string[] = []
    const rows = Array.from({ length: 250 }, (_, index) => ({
      pos: index,
      is_dir: index < 3,
      name: `n${String(index)}`,
    }))
    const http = fake((url, init) => {
      const headers = new Headers(init?.headers)
      seen.push(`${url} ${headers.get('start-pos') ?? ''}`)
      if (url.endsWith('/Empty/')) return new Response('', { status: 200 })
      const start = Number(headers.get('start-pos'))
      return new Response(JSON.stringify(rows.slice(start, start + 200)), {
        status: 200,
        headers: { 'total-num': '250' },
      })
    })
    const listing = await listFolder(http, 'Music')
    expect(listing.entries).toHaveLength(250)
    expect(listing.entries[0]).toEqual({ name: 'n0', folder: true, image: false, cue: false, playlist: false })
    expect(listing.truncated).toBe(false)
    expect(seen).toEqual(['/api/stock/dir/tmp/sdcard/Music/ 0', '/api/stock/dir/tmp/sdcard/Music/ 200'])
    expect(await listFolder(http, 'Empty')).toEqual({ entries: [], total: null, truncated: false })
  })

  it('confirms a new folder by reading its parent again, never by the reply alone', async () => {
    const calls: string[] = []
    let created = false
    const http = fake((url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (init?.method === 'POST') {
        created = !url.endsWith('/Ghost')
        return new Response('', { status: 200, headers: { 'is-exist': url.endsWith('/Old') ? '1' : '0' } })
      }
      const names = [...(created ? ['New'] : []), 'Old']
      return new Response(JSON.stringify(names.map((name, pos) => ({ pos, is_dir: true, name }))), {
        status: 200,
        headers: { 'total-num': String(names.length) },
      })
    })
    expect(await createFolder(http, 't', 'Music', 'New')).toBe('created')
    expect(calls.slice(0, 2)).toEqual([
      'POST /api/stock/dir/tmp/sdcard/Music/New',
      'GET /api/stock/dir/tmp/sdcard/Music/',
    ])
    expect(await createFolder(http, 't', 'Music', 'Old')).toBe('exists')
    // Stock answered 200, but the folder is not there: uncertain, not created.
    expect(await createFolder(http, 't', 'Music', 'Ghost')).toBe('uncertain')
    const refused = fake(() => new Response('Scan active', { status: 503 }))
    expect(await createFolder(refused, 't', '', 'X')).toBe('not-sent')
  })
})
