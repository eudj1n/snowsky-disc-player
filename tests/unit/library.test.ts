import { describe, expect, it } from 'vitest'
import { groupAlbums, recentAlbums } from '../../src/domain/album'
import type { LibraryTrack } from '../../src/domain/track'
import { libraryTrack, libraryTracks } from '../../src/gateway/library'

const row = {
  ID: 2,
  PATH: '/tmp/sdcard/Шёлк/01.flac',
  NAME: '01.flac',
  TITLE: 'Шёлк',
  ALBUM: 'Шёлк',
  ARTIST: 'Ваня Дмитриенко',
  ALBUM_ARTIST: '',
  GENRE: 'ruspop',
  DISC: 1,
  TRACK: 1,
  DURATION: 0,
  ADD_TIME: 1790017438,
}

function track(
  id: number,
  album: string | null,
  artist: string | null,
  addedAt = id,
  albumArtist: string | null = null,
): LibraryTrack {
  return {
    id,
    fileName: `${id}.flac`,
    title: `T${id}`,
    album,
    artist,
    albumArtist,
    genre: null,
    discNumber: null,
    trackNumber: null,
    path: null,
    durationMs: null,
    queuePosition: null,
    addedAt,
  }
}

describe('library rows', () => {
  it('maps stock SONG rows without inventing values', () => {
    expect(libraryTrack(row)).toMatchObject({
      id: 2,
      title: 'Шёлк',
      albumArtist: null,
      durationMs: null,
      trackNumber: 1,
      addedAt: 1790017438,
    })
  })

  it('falls back to the file name for untagged files and drops broken rows', () => {
    expect(libraryTrack({ ...row, TITLE: '' })?.title).toBe('01.flac')
    expect(libraryTrack({ ...row, ID: 0 })).toBeNull()
    const result = {
      query: 'tracks',
      columns: ['ID', 'NAME'],
      rows: [
        [1, 'a.flac'],
        [null, 'b.flac'],
      ],
      rows_returned: 2,
      truncated: false,
    }
    expect(libraryTracks(result).map((t) => t.id)).toEqual([1])
  })
})

describe('albums', () => {
  it('groups by stock album title and keeps every distinct credit', () => {
    const albums = groupAlbums([
      track(1, 'Mezmerize', 'SOAD'),
      track(2, 'Mezmerize', 'SOAD'),
      track(3, 'Hits', 'A'),
      track(4, 'Hits', 'B'),
      track(5, null, 'C'),
    ])
    expect(albums).toEqual([
      { title: 'Mezmerize', artists: ['SOAD'], trackCount: 2, addedAt: 2 },
      { title: 'Hits', artists: ['A', 'B'], trackCount: 2, addedAt: 4 },
    ])
  })

  it('prefers the album artist credit when present', () => {
    expect(groupAlbums([track(1, 'X', 'Guest', 1, 'Main')])[0]?.artists).toEqual(['Main'])
  })

  it('orders recent albums by the latest addition', () => {
    const albums = groupAlbums([track(1, 'Old', 'A', 10), track(2, 'New', 'B', 30), track(3, 'Old', 'A', 20)])
    expect(recentAlbums(albums, 1).map((a) => a.title)).toEqual(['New'])
  })
})
