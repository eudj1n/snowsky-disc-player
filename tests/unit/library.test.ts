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
      { title: 'Mezmerize', artists: ['SOAD'], trackArtists: ['SOAD'], trackCount: 2, addedAt: 2 },
      { title: 'Hits', artists: ['A', 'B'], trackArtists: ['A', 'B'], trackCount: 2, addedAt: 4 },
    ])
  })

  it('prefers the album artist credit when present, but scopes by the literal track artist', () => {
    const [album] = groupAlbums([track(1, 'X', 'Guest', 1, 'Main')])
    expect(album?.artists).toEqual(['Main'])
    expect(album?.trackArtists).toEqual(['Guest'])
  })

  it('keeps releases that share a title apart through the artist scope', async () => {
    const { albumScope, albumTracks, albumsBy } = await import('../../src/domain/album')
    const tracks = [
      track(1, 'Silhouette', 'A', 1),
      track(2, 'Silhouette', 'B', 2),
      track(3, 'Silhouette', 'A', 3),
      track(4, 'Second', 'A', 9),
      track(5, 'First', 'A', 5),
      track(6, 'Other', 'B', 4),
    ]
    const albums = groupAlbums(tracks)
    const byTitle = (title: string) => albums.filter((album) => album.title === title)
    expect(byTitle('Silhouette').map(albumScope)).toEqual([null])
    expect(byTitle('Second').map(albumScope)).toEqual(['A'])
    expect(albumTracks(tracks, 'Silhouette', 'A').map((t) => t.id)).toEqual([1, 3])
    expect(albumTracks(tracks, 'Silhouette', null).map((t) => t.id)).toEqual([1, 2, 3])
    expect(albumsBy(albums, 'A', 'Silhouette').map((a) => a.title)).toEqual(['Second', 'First'])
    expect(albumsBy(albums, 'B', 'Silhouette').map((a) => a.title)).toEqual(['Other'])
  })

  it('orders recent albums by the latest addition', () => {
    const albums = groupAlbums([track(1, 'Old', 'A', 10), track(2, 'New', 'B', 30), track(3, 'Old', 'A', 20)])
    expect(recentAlbums(albums, 1).map((a) => a.title)).toEqual(['New'])
  })
})

describe('album sorting', () => {
  it('orders by recent addition, title or artist with the locale collation', async () => {
    const { sortAlbums } = await import('../../src/domain/album')
    const albums = [
      { title: 'Ёлка', artists: ['Б'], trackArtists: ['Б'], trackCount: 1, addedAt: 2 },
      { title: 'album 10', artists: ['а'], trackArtists: ['а'], trackCount: 1, addedAt: 3 },
      { title: 'Album 9', artists: ['В'], trackArtists: ['В'], trackCount: 1, addedAt: 1 },
    ]
    expect(sortAlbums(albums, 'recent', 'ru').map((a) => a.title)).toEqual(['album 10', 'Ёлка', 'Album 9'])
    // Russian collation puts Cyrillic first; numbers compare numerically, case-insensitively.
    expect(sortAlbums(albums, 'title', 'ru').map((a) => a.title)).toEqual(['Ёлка', 'Album 9', 'album 10'])
    expect(sortAlbums(albums, 'title', 'en').map((a) => a.title)).toEqual(['Album 9', 'album 10', 'Ёлка'])
    expect(sortAlbums(albums, 'artist', 'ru').map((a) => a.artists[0])).toEqual(['а', 'Б', 'В'])
  })
})
