import { describe, expect, it } from 'vitest'
import { groupAlbums } from '../../src/domain/album'
import { libraryState, type LibraryFacts } from '../../src/domain/libraryState'
import type { LibraryTrack } from '../../src/domain/track'

const CARD = '/tmp/sdcard'
function track(id: number, album: string | null, artist: string | null, folder: string, genre: string | null = 'Rock') {
  return {
    id,
    fileName: `${String(id)}.flac`,
    title: `T${String(id)}`,
    album,
    artist,
    albumArtist: null,
    genre,
    path: `${CARD}/${folder}/${String(id)}.flac`,
    durationMs: 1000,
    disc: null,
    trackNumber: id,
    sampleRate: null,
    bitDepth: null,
    bitRate: null,
    cue: false,
    m3u: false,
    addedAt: id,
  } as unknown as LibraryTrack
}

const tracks = [
  track(1, 'Fallen', 'Evanescence', 'Evanescence - Fallen'),
  track(2, 'Fallen', 'Evanescence', 'Evanescence - Fallen'),
  track(3, 'The Open Door', 'Evanescence', 'Evanescence - The Open Door'),
  track(4, 'Night Drive', 'Northline', 'Northline - Night Drive', 'Unknown genre'),
  track(5, 'Unknown album', 'Unknown Artist', 'Loose'),
]
const albums = groupAlbums(tracks)
const facts = (over: Partial<LibraryFacts> = {}): LibraryFacts => ({
  tracks,
  albums,
  artists: [{ name: 'Evanescence' }, { name: 'Northline' }],
  identifiedArtist: (name) => name === 'Evanescence',
  identifiedAlbum: (album) => album.title === 'Fallen',
  coverState: (album) =>
    album.title === 'The Open Door' ? 'found' : album.title === 'Night Drive' ? 'missing' : 'unknown',
  photo: (name) => name === 'Evanescence',
  background: () => false,
  walk: null,
  years: {},
  ...over,
})

describe('the library state', () => {
  it('counts identities, images and tags from what the page knows', () => {
    const state = libraryState(facts())
    expect(state.artists).toEqual({ total: 2, identified: 1, photo: 1, background: 0 })
    expect(state.albums).toMatchObject({ total: 4, identified: 1, noYear: null })
    // Before the walk no folder cover is known: a found cover counts as inside the files.
    expect(state.albums.covers).toEqual({ embedded: 1, folder: 0, none: 1, unknown: 2 })
    expect(state.lyrics).toEqual({ tracks: 5, sidecar: null })
    expect(state.tags).toEqual({ unknownArtist: 1, unknownAlbum: 1, unknownGenre: 1 })
  })

  it("takes the card walk's folder covers, .lrc files and years", () => {
    const state = libraryState(
      facts({
        walk: {
          lyrics: [`${CARD}/Evanescence - Fallen/1.lrc`, `${CARD}/Loose/other.lrc`],
          images: [`${CARD}/Evanescence - Fallen/Folder.jpg`, `${CARD}/Northline - Night Drive/back.jpg`],
        },
        years: { [`${CARD}/Evanescence - Fallen/2.flac`]: 2003 },
      }),
    )
    // Fallen's folder cover counts even though its files were not read; a back cover is not a cover.
    expect(state.albums.covers).toEqual({ embedded: 1, folder: 1, none: 1, unknown: 1 })
    expect(state.lyrics.sidecar).toBe(1)
    expect(state.albums.noYear).toBe(3)
  })
})
