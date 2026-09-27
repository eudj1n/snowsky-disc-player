import { describe, expect, it } from 'vitest'
import { groupReleases } from '../../src/domain/album'
import {
  albumSpace,
  artistSpace,
  byFormat,
  cardUsage,
  comparable,
  duplicates,
  formatGroup,
  playsByPath,
  type FileFacts,
} from '../../src/domain/space'
import type { LibraryTrack } from '../../src/domain/track'

const file = (bytes: number, format = 'flac', rest: Partial<FileFacts> = {}): FileFacts => ({
  bytes,
  format,
  sampleRate: 44100,
  bitDepth: 16,
  bitRate: null,
  ...rest,
})

let nextId = 1
function track(path: string, title: string, rest: Partial<LibraryTrack> = {}): LibraryTrack {
  return {
    id: nextId++,
    title,
    artist: 'Artist',
    album: 'Album',
    albumArtist: null,
    genre: null,
    discNumber: null,
    trackNumber: null,
    addedAt: null,
    queuePosition: null,
    path,
    durationMs: 200_000,
    fileName: path.split('/').at(-1) ?? path,
    ...rest,
  }
}

describe('card space', () => {
  it('names formats as they are compared, hi-res and the two kinds of MP4 apart', () => {
    expect(formatGroup(file(1))).toEqual({ label: 'FLAC', lossless: true })
    expect(formatGroup(file(1, 'flac', { sampleRate: 96000, bitDepth: 24 }))).toEqual({
      label: 'FLAC Hi-Res',
      lossless: true,
    })
    expect(formatGroup(file(1, 'flac', { bitDepth: 24 })).label).toBe('FLAC Hi-Res')
    expect(formatGroup(file(1, 'mp3', { bitRate: 320, bitDepth: null }))).toEqual({ label: 'MP3', lossless: false })
    expect(formatGroup(file(1, 'm4a', { bitRate: 256, bitDepth: null })).label).toBe('AAC')
    expect(formatGroup(file(1, 'm4a', { bitDepth: 24, sampleRate: 96000 })).label).toBe('ALAC Hi-Res')
    expect(formatGroup(file(1, 'm4a', { bitDepth: null, sampleRate: null })).label).toBe('M4A')
    expect(formatGroup(file(1, 'dsf')).label).toBe('DSD')
  })

  it('adds up formats, largest first', () => {
    const shares = byFormat([file(10), file(30, 'mp3', { bitRate: 320 }), file(15), file(5, 'flac', { bitDepth: 24 })])
    expect(shares.map((share) => [share.label, share.bytes, share.files])).toEqual([
      ['MP3', 30, 1],
      ['FLAC', 25, 2],
      ['FLAC Hi-Res', 5, 1],
    ])
  })

  it('sizes albums and their artists, with the plays of their tracks', () => {
    const tracks = [
      track('/tmp/sdcard/A/1.flac', 'One', { album: 'Big', artist: 'Lead' }),
      track('/tmp/sdcard/A/2.flac', 'Two', { album: 'Big', artist: 'Lead' }),
      track('/tmp/sdcard/B/1.mp3', 'Three', { album: 'Small', artist: 'Lead' }),
      track('/tmp/sdcard/C/1.flac', 'Four', { album: 'Other', artist: 'Else' }),
    ]
    const files = {
      '/tmp/sdcard/A/1.flac': file(40),
      '/tmp/sdcard/A/2.flac': file(50),
      '/tmp/sdcard/B/1.mp3': file(5, 'mp3', { bitRate: 320 }),
    }
    const albums = albumSpace(groupReleases(tracks), tracks, files, new Map([['/tmp/sdcard/A/1.flac', 3]]))
    expect(albums.map((entry) => [entry.album.title, entry.bytes, entry.measured, entry.files, entry.plays])).toEqual([
      ['Big', 90, 2, 2, 3],
      ['Small', 5, 1, 1, 0],
      ['Other', 0, 0, 1, 0],
    ])
    expect(albums[0]?.formats).toEqual(['FLAC'])
    const artists = artistSpace(albums, (album) => album.artists[0] ?? null)
    expect(artists.map((artist) => [artist.name, artist.bytes, artist.albums])).toEqual([
      ['Lead', 95, 2],
      ['Else', 0, 1],
    ])
  })

  it('counts the one file of a CUE sheet once for its album', () => {
    const image = '/tmp/sdcard/Best of/Image.flac'
    const tracks = [
      track(image, 'Break the Line', { album: 'Best of', cue: true }),
      track(image, 'Open Your Eyes', { album: 'Best of', cue: true }),
      track(image, 'Big in Japan', { album: 'Best of', cue: true }),
    ]
    const [album] = albumSpace(groupReleases(tracks), tracks, { [image]: file(400) }, new Map())
    expect([album?.bytes, album?.files, album?.measured, album?.album.trackCount]).toEqual([400, 1, 1, 3])
    // Same folder, same file: never a duplicate of itself.
    expect(duplicates(tracks, { [image]: file(400) })).toEqual([])
  })

  it('compares titles without case, numbers, extensions and punctuation', () => {
    expect(comparable('01 - Numb.flac')).toBe('numb')
    expect(comparable('Numb!')).toBe('numb')
    expect(comparable('  Тихий   океан ')).toBe('тихий океан')
    expect(comparable('1979')).toBe('1979')
  })

  it('finds the same tracks in two folders and orders them by what could be freed', () => {
    const tracks = [
      track('/tmp/sdcard/Meteora (Hi-Res)/01 Numb.flac', 'Numb', { artist: 'LP' }),
      track('/tmp/sdcard/Meteora (Hi-Res)/02 Faint.flac', 'Faint', { artist: 'LP' }),
      track('/tmp/sdcard/Meteora/01 Numb.mp3', 'Numb', { artist: 'LP', durationMs: 201_000 }),
      track('/tmp/sdcard/Meteora/02 Faint.mp3', 'faint', { artist: 'lp' }),
      // A live take of the same title is another recording.
      track('/tmp/sdcard/Live/Numb.flac', 'Numb', { artist: 'LP', durationMs: 260_000 }),
      // One single elsewhere, unmeasured.
      track('/tmp/sdcard/Singles/Faint.flac', 'Faint', { artist: 'LP' }),
      // Same title, another artist.
      track('/tmp/sdcard/Other/Numb.flac', 'Numb', { artist: 'Someone' }),
    ]
    const files = {
      '/tmp/sdcard/Meteora (Hi-Res)/01 Numb.flac': file(90, 'flac', { sampleRate: 96000, bitDepth: 24 }),
      '/tmp/sdcard/Meteora (Hi-Res)/02 Faint.flac': file(80, 'flac', { sampleRate: 96000, bitDepth: 24 }),
      '/tmp/sdcard/Meteora/01 Numb.mp3': file(9, 'mp3', { bitRate: 320 }),
      '/tmp/sdcard/Meteora/02 Faint.mp3': file(8, 'mp3', { bitRate: 320 }),
    }
    const pairs = duplicates(tracks, files)
    expect(pairs[0]).toEqual({
      tracks: 2,
      copies: [
        { folder: '/tmp/sdcard/Meteora', bytes: 17, formats: ['MP3'] },
        { folder: '/tmp/sdcard/Meteora (Hi-Res)', bytes: 170, formats: ['FLAC Hi-Res'] },
      ],
    })
    const folders = pairs.map((pair) => pair.copies.map((copy) => copy.folder).join(' | '))
    expect(folders).not.toContain('/tmp/sdcard/Live | /tmp/sdcard/Meteora')
    expect(folders.some((pair) => pair.includes('/tmp/sdcard/Other'))).toBe(false)
    expect(folders).toContain('/tmp/sdcard/Meteora | /tmp/sdcard/Singles')
    expect(duplicates([tracks[0] as LibraryTrack, tracks[1] as LibraryTrack], files)).toEqual([])
  })

  it('splits the used space into music and other files', () => {
    expect(cardUsage({ totalBytes: 100, freeBytes: 10 }, 60)).toEqual({ total: 100, free: 10, music: 60, other: 30 })
    // Never more music than the used space, never a negative rest.
    expect(cardUsage({ totalBytes: 100, freeBytes: 10 }, 95)).toEqual({ total: 100, free: 10, music: 90, other: 0 })
    expect(cardUsage(null, 5)).toBeNull()
    expect(cardUsage({ totalBytes: 0, freeBytes: 0 }, 5)).toBeNull()
  })

  it('counts plays per file and knows when the history begins', () => {
    const { counts, since } = playsByPath([
      { path: '/a', at: 200 },
      { path: '/b', at: 100 },
      { path: '/a', at: 300 },
    ])
    expect(counts.get('/a')).toBe(2)
    expect(since).toBe(100)
    expect(playsByPath([]).since).toBeNull()
  })
})
