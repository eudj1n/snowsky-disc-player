import { describe, expect, it } from 'vitest'
import { UNKNOWN_PLAYBACK, withLibraryNames } from '../../src/domain/playback'
import { mergePlayback, parsePlayback, playbackOf, playbackWire } from '../../src/gateway/playback'
import { trackKey } from '../../src/domain/track'

const song = {
  song_name: 'Question!',
  song_artist_name: 'System Of A Down',
  song_album_name: 'Mezmerize',
  song_file_path: '/tmp/sdcard/a.flac',
  pos_id: 3,
  song_duration_time: 200000,
}

describe('a202 playback observation', () => {
  it('marks a CUE track, whose file path the other tracks of its sheet share', () => {
    const cue = { ...song, song_track: 0, is_cue: true }
    expect(parsePlayback(JSON.stringify({ state: 0, playerflag: 3, song: cue })).track?.cue).toBe(true)
    expect(parsePlayback(JSON.stringify({ state: 0, playerflag: 3, song })).track).not.toHaveProperty('cue')
  })

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
      sampleRate: null,
      bitDepth: null,
      bitRate: null,
      dsd: false,
    })
  })

  it('reads the decoding facts stock reports for the playing file', () => {
    const facts = { ...song, song_sample_rate: 96000, song_encoding_rate: 24, song_bit_rate: 4608, is_dsd: false }
    const playback = parsePlayback(JSON.stringify({ state: 0, playerflag: 3, song: facts }))
    expect(playback.track).toMatchObject({ sampleRate: 96000, bitDepth: 24, bitRate: 4608, dsd: false })
    const unknown = parsePlayback(JSON.stringify({ state: 0, song: { ...song, song_sample_rate: 0 } }))
    expect(unknown.track?.sampleRate).toBeNull()
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

describe('partial a202 reduction (reference merge_snapshot)', () => {
  const full = (title: string, state = 0, love = true) =>
    playbackWire(
      JSON.stringify({
        state,
        playerflag: 3,
        love,
        song: JSON.stringify({
          song_name: title,
          song_artist_name: 'Берег',
          song_album_name: 'Тихий океан',
          pos_id: 2,
        }),
      }),
    )

  it('keeps the song when a record carries only the state, as after a track switch', () => {
    const merged = mergePlayback(full('Волны', 1), playbackWire('{"state":0}'))
    const playback = playbackOf(merged)
    expect(playback.state).toBe('playing')
    expect(playback.track?.title).toBe('Волны')
    expect(playback.favorite).toBe(true)
  })

  it('replaces everything for a different song and clears it on state 2', () => {
    const next = mergePlayback(full('Волны'), playbackWire(JSON.stringify({ state: 0, song: { song_name: 'Берег' } })))
    expect(playbackOf(next).track?.title).toBe('Берег')
    expect(playbackOf(next).favorite).toBeNull()
    const loading = mergePlayback(full('Волны'), playbackWire('{"state":2}'))
    expect(playbackOf(loading)).toMatchObject({ state: 'loading', track: null })
  })

  it('ignores an empty record and repeats of the same song idempotently', () => {
    const state = full('Волны')
    expect(mergePlayback(state, playbackWire(''))).toBe(state)
    expect(playbackOf(mergePlayback(state, full('Волны')))).toEqual(playbackOf(state))
  })
})

describe('the playing track named by the library', () => {
  const cut = parsePlayback(
    JSON.stringify({ state: 1, song: { ...song, song_album_name: 'Meteora 20th Anniversary Edit' } }),
  )
  const row = { title: 'Question!', artist: 'System Of A Down', album: 'Meteora 20th Anniversary Edition' }

  it('takes the whole names of the same card file from the library', () => {
    const named = withLibraryNames(cut, (track) => (track.path === '/tmp/sdcard/a.flac' ? row : undefined))
    expect(named.track).toMatchObject({ album: 'Meteora 20th Anniversary Edition', path: '/tmp/sdcard/a.flac' })
    expect(named.state).toBe(cut.state)
  })

  it('names a CUE track from its own row, not from another track of the same file', () => {
    const image = '/tmp/sdcard/Best of/Image.flac'
    const rows = [
      { path: image, title: 'Opening Frame', artist: 'Tessera', album: 'Image Sessions', cue: true },
      { path: image, title: 'Second Frame', artist: 'Tessera', album: 'Image Sessions', cue: true },
      { path: image, title: 'Last Frame', artist: 'Tessera', album: 'Image Sessions', cue: true },
    ]
    const byKey = new Map(rows.map((row) => [trackKey(row), row]))
    const song = {
      song_name: 'Second Frame',
      song_artist_name: 'Tessera',
      song_album_name: 'Image Sess',
      song_file_path: image,
      is_cue: true,
    }
    const playing = parsePlayback(JSON.stringify({ state: 0, playerflag: 3, song }))
    const named = withLibraryNames(playing, (track) => byKey.get(trackKey(track)))
    expect(named.track).toMatchObject({ title: 'Second Frame', album: 'Image Sessions', cue: true })
  })

  it('keeps the play state without a library row, and nothing playing as it is', () => {
    expect(withLibraryNames(cut, () => undefined)).toBe(cut)
    expect(withLibraryNames(UNKNOWN_PLAYBACK, () => row)).toBe(UNKNOWN_PLAYBACK)
  })
})
