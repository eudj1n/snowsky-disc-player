import { describe, expect, it } from 'vitest'
import { groupReleases } from '../../src/domain/album'
import { pathsHash } from '../../src/domain/history'
import { remembered } from '../../src/domain/resume'
import type { LibraryTrack } from '../../src/domain/track'
import { resumeTarget } from '../../src/gateway/resume'

const row = (id: number, title: string, rest: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id,
  title,
  artist: 'Lumen',
  album: 'Night Lines',
  albumArtist: null,
  genre: 'Jazz',
  discNumber: null,
  trackNumber: null,
  addedAt: null,
  queuePosition: null,
  path: `/tmp/sdcard/Lumen - Night Lines/${title}.flac`,
  durationMs: 200_000,
  fileName: `${title}.flac`,
  ...rest,
})

describe('the track stock remembers while it reports nothing', () => {
  const queue = [row(1, 'Signal'), row(2, 'Streetlight')]
  const raw = queue.map((track) => ({ ID: track.id, SONG_TYPE: 3 }))

  it('takes the MEMORY_PLAY row of the persisted queue and describes that queue', () => {
    const kept = remembered([{ MUSIC_ID: 2, IS_PLAYING: 1, POSITION: 61_000 }], raw, queue)
    expect(kept?.track.title).toBe('Streetlight')
    expect(kept?.positionMs).toBe(61_000)
    expect(kept?.context).toEqual({
      type: 3,
      count: 2,
      hash: pathsHash(queue.map((track) => track.path ?? '')),
      album: 'Night Lines',
      artist: 'Lumen',
      genre: 'Jazz',
      folder: '/tmp/sdcard/Lumen - Night Lines',
    })
    // "Song" memory keeps no position.
    expect(remembered([{ MUSIC_ID: 1, POSITION: 0 }], raw, queue)?.positionMs).toBeNull()
  })

  it('has nothing to show without the record, the row or the queue', () => {
    expect(remembered([], raw, queue)).toBeNull()
    expect(remembered([{ MUSIC_ID: 9 }], raw, queue)).toBeNull()
    expect(remembered([{ MUSIC_ID: 1 }], [], [])).toBeNull()
  })

  it('starts the remembered track again in the same source', () => {
    const kept = remembered([{ MUSIC_ID: 2 }], raw, queue)
    if (!kept) throw new Error('remembered')
    const key = { title: 'Streetlight', artist: 'Lumen' }
    const [album] = groupReleases(queue)
    if (!album) throw new Error('album')
    expect(resumeTarget(kept, { kind: 'album', album, scope: null })).toEqual({
      kind: 'album',
      album: 'Night Lines',
      track: key,
    })
    expect(resumeTarget(kept, { kind: 'album', album, scope: 'Lumen' })).toEqual({
      kind: 'artistAlbum',
      artist: 'Lumen',
      album: 'Night Lines',
      track: key,
    })
    // Stock plays a whole artist only from its start: the track continues in its album of that artist.
    expect(resumeTarget(kept, { kind: 'artist', artist: 'Lumen' })).toEqual({
      kind: 'artistAlbum',
      artist: 'Lumen',
      album: 'Night Lines',
      track: key,
    })
    expect(resumeTarget(kept, { kind: 'genre', genre: 'Jazz' })).toEqual({ kind: 'genre', genre: 'Jazz', track: key })
    expect(resumeTarget(kept, { kind: 'favorites', count: 2 })).toEqual({ kind: 'favorites', track: key })
    expect(resumeTarget(kept, { kind: 'library' })).toEqual({ kind: 'library', track: key })
    // An unknown queue that is one folder plays from the folder.
    expect(resumeTarget(kept, null)).toEqual({
      kind: 'folder',
      folder: 'Lumen - Night Lines',
      file: 'Streetlight.flac',
    })
  })
})
