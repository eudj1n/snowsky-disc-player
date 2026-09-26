import { describe, expect, it } from 'vitest'
import { groupReleases } from '../../src/domain/album'
import { playRecords, recentlyPlayedAlbums, sortTracks } from '../../src/domain/history'
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
