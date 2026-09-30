import { describe, expect, it } from 'vitest'
import { groupArtists } from '../../src/domain/artist'
import { sleeve } from '../../src/domain/artwork'
import type { LibraryTrack } from '../../src/domain/track'
import { timeLabel } from '../../src/domain/track'
import { playlists } from '../../src/gateway/library'

function track(id: number, artist: string | null, album: string | null): LibraryTrack {
  return {
    id,
    fileName: `${id}.flac`,
    title: `T${id}`,
    artist,
    album,
    albumArtist: null,
    genre: null,
    discNumber: null,
    trackNumber: null,
    path: null,
    durationMs: null,
    queuePosition: null,
    addedAt: null,
  }
}

describe('placeholder sleeves', () => {
  it('match the reference hash vectors (palette index and letters)', () => {
    // Vectors computed from DISC Web app.js art(): hash % 6, first two code points.
    expect(sleeve(undefined)).toEqual({ palette: 0, letters: '♪' })
    expect(sleeve('')).toEqual({ palette: 0, letters: '♪' })
    expect(sleeve('Afterglow')).toEqual({ palette: 5, letters: 'AF' })
    expect(sleeve('Blue Hours')).toEqual({ palette: 3, letters: 'BL' })
    expect(sleeve('Тихий океан')).toEqual({ palette: 2, letters: 'ТИ' })
    expect(sleeve('  Лето внутри ')).toEqual({ palette: 4, letters: 'ЛЕ' })
    expect(sleeve('a')).toEqual({ palette: 1, letters: 'A' })
    expect(sleeve('DISC')).toEqual({ palette: 3, letters: 'DI' })
  })
})

describe('artists and playlists', () => {
  it('groups artists with album and track counts', () => {
    const artists = groupArtists([
      track(1, 'A', 'X'),
      track(2, 'A', 'Y'),
      track(3, 'A', 'Y'),
      track(4, 'B', null),
      track(5, null, 'Z'),
    ])
    expect(artists).toEqual([
      { name: 'A', albumCount: 2, trackCount: 3, literal: true },
      { name: 'B', albumCount: 0, trackCount: 1, literal: true },
    ])
  })

  it('maps playlists rows and drops broken ones', () => {
    const result = {
      query: 'playlists',
      columns: ['ID', 'LIST_ID', 'LIST_NAME', 'M3U_PATH', 'tracks'],
      rows: [
        [1, 0, 'test', null, 0],
        [2, 1, 'alt2', null, 105],
        [3, null, 'broken', null, 1],
      ],
      rows_returned: 3,
      truncated: false,
    }
    expect(playlists(result)).toEqual([
      { id: 1, listId: 0, name: 'test', trackCount: 0 },
      { id: 2, listId: 1, name: 'alt2', trackCount: 105 },
    ])
  })

  it('labels unknown times like the reference', () => {
    expect(timeLabel(null)).toBe('—:—')
    expect(timeLabel(185_000)).toBe('3:05')
  })
})
