import { describe, expect, it } from 'vitest'
import { librarySummary } from '../../src/gateway/library'
import { formatBadge, formatDuration, trackCredits } from '../../src/domain/track'

describe('track presentation helpers', () => {
  it('formats durations without guessing unknown values', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(200_000)).toBe('3:20')
    expect(formatDuration(3_725_000)).toBe('1:02:05')
    expect(formatDuration(null)).toBeNull()
    expect(formatDuration(-1)).toBeNull()
  })

  it('joins only known credits', () => {
    expect(trackCredits({ artist: 'A', album: 'B' })).toBe('A · B')
    expect(trackCredits({ artist: null, album: 'B' })).toBe('B')
    expect(trackCredits({ artist: null, album: null })).toBe('')
  })

  it('derives a format badge only from an observed path', () => {
    expect(formatBadge('/tmp/sdcard/Альбом/01 Трек.flac')).toBe('FLAC')
    expect(formatBadge('/tmp/sdcard/noext')).toBeNull()
    expect(formatBadge(null)).toBeNull()
  })
})

describe('library mapping', () => {
  it('maps library_summary into the domain object', () => {
    const result = {
      query: 'library_summary',
      columns: ['tracks', 'favorites', 'playlists', 'queue_table', 'last_added', 'last_id'],
      rows: [[779, 1, 3, 1, 0, 785]],
      rows_returned: 1,
      truncated: false,
    }
    expect(librarySummary(result)).toEqual({
      tracks: 779,
      favorites: 1,
      playlists: 3,
      lastAdded: 0,
      lastId: 785,
    })
    expect(librarySummary({ ...result, rows: [], rows_returned: 0 })).toBeNull()
  })
})
