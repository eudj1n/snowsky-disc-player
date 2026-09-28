import { describe, expect, it } from 'vitest'
import { groupReleases } from '../../src/domain/album'
import {
  pathsHash,
  playRecords,
  libraryNames,
  mostPlayed,
  playSource,
  recentlyPlayedAlbums,
  recentSources,
  servicePlayRecords,
  servicePlays,
  sortTracks,
  sourceIndex,
  type PlayContext,
} from '../../src/domain/history'
import type { LibraryTrack } from '../../src/domain/track'

const track = (id: number, album: string, artist: string, addedAt = id): LibraryTrack => ({
  id,
  fileName: `${id}.flac`,
  title: `T${id}`,
  album,
  artist,
  albumArtist: null,
  genre: null,
  discNumber: null,
  trackNumber: null,
  path: `/tmp/sdcard/${artist} - ${album}/${id}.flac`,
  durationMs: null,
  queuePosition: null,
  addedAt,
})

const tracks = [track(1, 'A', 'X'), track(2, 'A', 'X'), track(3, 'B', 'Y', 9), track(4, 'C', 'Z', 5)]
const records = playRecords([
  { PATH: tracks[1]?.path, PLAY_COUNT: 2, LAST_PLAY_TIME: 300 },
  { PATH: tracks[2]?.path, PLAY_COUNT: 5, LAST_PLAY_TIME: 200 },
  { PATH: tracks[0]?.path, PLAY_COUNT: 2, LAST_PLAY_TIME: 100 },
  { PATH: '/tmp/sdcard/gone.flac', PLAY_COUNT: 9, LAST_PLAY_TIME: 400 },
  { PATH: '', PLAY_COUNT: 1, LAST_PLAY_TIME: 1 },
])

describe('play history', () => {
  it('reads records and skips rows without a path', () => {
    expect(records.map((record) => record.playCount)).toEqual([2, 5, 2, 9])
  })

  it('lists albums in the order they were last played, each once, and drops missing files', () => {
    const albums = groupReleases(tracks)
    expect(recentlyPlayedAlbums(records, albums, tracks, 8).map((album) => album.title)).toEqual(['A', 'B'])
    expect(recentlyPlayedAlbums(records, albums, tracks, 1).map((album) => album.title)).toEqual(['A'])
  })

  it('sorts tracks by library order, addition or plays', () => {
    expect(sortTracks(tracks, 'library').map((t) => t.id)).toEqual([1, 2, 3, 4])
    expect(sortTracks(tracks, 'added').map((t) => t.id)).toEqual([3, 4, 2, 1])
    // Most played: counts, then the latest play; unplayed tracks keep library order.
    expect(sortTracks(tracks, 'played', records).map((t) => t.id)).toEqual([3, 2, 1, 4])
  })
})

describe('the service play history (next image)', () => {
  const genreTrack = (id: number, genre: string) => ({ ...track(id, 'G', `A${id}`), genre })
  const library = [...tracks, genreTrack(5, 'Jazz'), genreTrack(6, 'Jazz')]
  const albums = groupReleases(library)
  const context = (paths: (string | null)[], type: number, extra = {}): PlayContext => ({
    type,
    count: paths.length,
    hash: pathsHash(paths.flatMap((path) => (path ? [path] : []))),
    album: null,
    artist: null,
    genre: null,
    folder: null,
    ...extra,
  })
  const paths = (list: LibraryTrack[]) => list.map((item) => item.path)

  it('hashes a set of paths like the service, whatever their order', () => {
    expect(pathsHash(['/x', '/y'])).toBe(pathsHash(['/y', '/x']))
    expect(pathsHash([])).toBe('0000000000000000')
    expect(pathsHash(['/tmp/sdcard/a.flac'])).toMatch(/^[0-9a-f]{16}$/)
  })

  it('reads records, ignores damaged ones and counts plays per track in list order', () => {
    const plays = servicePlays({
      records: [
        { v: 1, t: 10, path: tracks[0]?.path, s: 40, ctx: { type: 3, count: 2, hash: 'abc', album: 'A' } },
        { v: 1, t: 20, path: '', s: 40, ctx: {} },
        { v: 1, t: 30, path: tracks[0]?.path, s: 35, ctx: { type: 1, count: 6, hash: '0123456789abcdef' } },
        'not a record',
      ],
    })
    expect(plays.map((play) => [play.at, play.context.hash])).toEqual([
      [10, null],
      [30, '0123456789abcdef'],
    ])
    expect(servicePlayRecords(plays)).toEqual([{ path: tracks[0]?.path, title: null, playCount: 2, lastPlayedAt: 2 }])
  })

  it('names the source of a play by its queue, then by the fields its rows shared', () => {
    const loved = [tracks[0], tracks[3]] as LibraryTrack[]
    const index = sourceIndex({ albums, tracks: library, favorites: loved })
    const source = (ctx: PlayContext) => playSource(ctx, index, albums, libraryNames(library))
    expect(source(context(paths(library.filter((t) => t.album === 'A')), 3))).toMatchObject({
      kind: 'album',
      scope: 'X',
    })
    expect(source(context(paths(library.filter((t) => t.genre === 'Jazz')), 2))).toEqual({
      kind: 'genre',
      genre: 'Jazz',
    })
    expect(source(context(paths(loved), 6))).toMatchObject({ kind: 'favorites' })
    expect(source(context(paths(library), 1))).toEqual({ kind: 'library' })
    // The library changed since: the shared album or genre still names it.
    expect(source({ ...context(['/gone.flac'], 3), album: 'B', artist: 'Y' })).toMatchObject({
      kind: 'album',
      scope: 'Y',
    })
    expect(source({ ...context(['/gone.flac'], 2), genre: 'Jazz' })).toEqual({ kind: 'genre', genre: 'Jazz' })
    expect(source({ ...context(['/gone.flac'], 2), artist: 'X' })).toEqual({ kind: 'artist', artist: 'X' })
    expect(source(context(['/gone.flac'], 2))).toBeNull()
    // Deleted from the card: an album queue whose album is gone is not its artist or genre, and an
    // artist or genre with no track left names nothing.
    expect(source({ ...context(['/gone.flac'], 3), album: 'Gone', artist: 'X', genre: 'Jazz' })).toBeNull()
    expect(source({ ...context(['/gone.flac'], 2), artist: 'Nobody' })).toBeNull()
    expect(source({ ...context(['/gone.flac'], 2), genre: 'Polka' })).toBeNull()
  })

  it('lists the sources the listener started, newest first, each once, without all tracks', () => {
    const index = sourceIndex({ albums, tracks: library, favorites: [] })
    const plays = servicePlays({
      records: [
        { v: 1, t: 1, path: tracks[0]?.path, s: 40, ctx: context(paths(library.filter((t) => t.album === 'A')), 3) },
        {
          v: 1,
          t: 2,
          path: library[4]?.path,
          s: 40,
          ctx: context(paths(library.filter((t) => t.genre === 'Jazz')), 2),
        },
        { v: 1, t: 3, path: tracks[1]?.path, s: 40, ctx: context(paths(library.filter((t) => t.album === 'A')), 3) },
        { v: 1, t: 4, path: tracks[2]?.path, s: 40, ctx: context(paths(library), 1) },
      ],
    })
    const recent = recentSources(plays, (ctx) => playSource(ctx, index, albums, libraryNames(library)), 8)
    expect(recent.map(({ source }) => source.kind)).toEqual(['album', 'genre'])
    expect(recent[0]?.path).toBe(tracks[1]?.path)
  })

  it('picks the most played tracks, most first, only those played at all', () => {
    const list = tracks.slice(0, 4)
    const records = [
      { path: list[1]?.path ?? '', playCount: 2, lastPlayedAt: 10 },
      { path: list[3]?.path ?? '', playCount: 5, lastPlayedAt: 5 },
      { path: list[0]?.path ?? '', playCount: 2, lastPlayedAt: 20 },
    ]
    expect(mostPlayed(list, records, 6).map((track) => track.id)).toEqual([list[3]?.id, list[0]?.id, list[1]?.id])
    expect(mostPlayed(list, records, 1).map((track) => track.id)).toEqual([list[3]?.id])
    expect(mostPlayed(list, [], 6)).toEqual([])
  })

  it('counts a CUE image per track by the title the service recorded', () => {
    const image = '/tmp/sdcard/Live/Image.flac'
    const cue = (id: number, title: string): LibraryTrack => ({
      ...track(id, 'Live', 'Band'),
      path: image,
      title,
      cue: true,
    })
    const parts = [cue(11, 'Part One'), cue(12, 'Part Two'), cue(13, 'Part Three')]
    const plays = servicePlays({
      records: [
        { v: 1, t: 1, path: image, title: 'Part Two', s: 40, ctx: {} },
        { v: 1, t: 2, path: image, title: 'Part Two', s: 40, ctx: {} },
        { v: 1, t: 3, path: image, title: 'Part One', s: 40, ctx: {} },
      ],
    })
    expect(plays.map((play) => play.title)).toEqual(['Part Two', 'Part Two', 'Part One'])
    const records = servicePlayRecords(plays)
    expect(records.map((record) => [record.title, record.playCount])).toEqual([
      ['Part Two', 2],
      ['Part One', 1],
    ])
    expect(sortTracks(parts, 'played', records).map((item) => item.title)).toEqual([
      'Part Two',
      'Part One',
      'Part Three',
    ])
    // A play recorded before the service named CUE tracks counts for each track of the file.
    const older = servicePlayRecords(servicePlays({ records: [{ v: 1, t: 1, path: image, s: 40, ctx: {} }] }))
    expect(sortTracks(parts, 'played', older).map((item) => item.title)).toEqual(['Part One', 'Part Two', 'Part Three'])
  })

  it('orders tracks by their last play for the history sort', () => {
    const records = servicePlayRecords(
      servicePlays({
        records: [tracks[2], tracks[0], tracks[2]].map((item, n) => ({ v: 1, t: n, path: item?.path, s: 40, ctx: {} })),
      }),
    )
    expect(sortTracks(tracks, 'recent', records).map((item) => item.id)).toEqual([3, 1, 2, 4])
  })
})
