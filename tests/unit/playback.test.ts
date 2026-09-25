import { describe, expect, it } from 'vitest'
import { UNKNOWN_PLAYBACK } from '../../src/domain/playback'
import { parsePlayback } from '../../src/gateway/playback'

const song = {
  song_name: 'Question!',
  song_artist_name: 'System Of A Down',
  song_album_name: 'Mezmerize',
  song_file_path: '/tmp/sdcard/a.flac',
  pos_id: 3,
  song_duration_time: 200000,
}

describe('a202 playback observation', () => {
  it('reads a playing track with its one-based queue position', () => {
    const playback = parsePlayback(JSON.stringify({ state: 0, playerflag: 3, love: true, song }))
    expect(playback.state).toBe('playing')
    expect(playback.source).toBe('album')
    expect(playback.favorite).toBe(true)
    expect(playback.track).toEqual({
      title: 'Question!',
      artist: 'System Of A Down',
      album: 'Mezmerize',
      path: '/tmp/sdcard/a.flac',
      durationMs: 200000,
      queuePosition: 2,
    })
  })

  it('accepts the song as a JSON string, as stock sends it', () => {
    expect(parsePlayback(JSON.stringify({ state: 1, song: JSON.stringify(song) })).state).toBe('paused')
  })

  it('never proves a stop: state 2 is loading, a missing track is unknown', () => {
    expect(parsePlayback(JSON.stringify({ state: 2, song })).state).toBe('loading')
    expect(parsePlayback(JSON.stringify({ state: 0 })).state).toBe('unknown')
    expect(parsePlayback('')).toEqual(UNKNOWN_PLAYBACK)
  })

  it('rejects wrong types instead of guessing', () => {
    expect(() => parsePlayback(JSON.stringify({ state: '0' }))).toThrow(SyntaxError)
    expect(() => parsePlayback(JSON.stringify({ state: 0, song: { song_name: 5 } }))).toThrow(SyntaxError)
    expect(() => parsePlayback(JSON.stringify({ state: 0, song: { song_name: 'x', pos_id: -1 } }))).toThrow(SyntaxError)
    expect(() => parsePlayback('[]')).toThrow(SyntaxError)
  })
})
