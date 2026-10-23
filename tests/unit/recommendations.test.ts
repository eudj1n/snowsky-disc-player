import { describe, expect, it } from 'vitest'
import type { Album } from '../../src/domain/album'
import {
  groupsNotOnCard,
  popularTracksOnCard,
  recordingOfTrack,
  similarArtistsOnCard,
  similarTracksOnCard,
} from '../../src/domain/recommendations'
import type { LibraryTrack, Track } from '../../src/domain/track'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const C = '00000000-0000-4000-8000-00000000000c'
const track = (title: string, artist = 'Mira Sol'): Track =>
  ({
    id: title.length,
    title,
    artist,
    album: 'Afterglow',
    path: `/${title}.flac`,
    durationMs: null,
  }) as unknown as Track
const album = (title: string): Album =>
  ({
    key: title,
    title,
    artists: ['Mira Sol'],
    trackArtists: ['Mira Sol'],
    paths: {},
    trackCount: 1,
    genres: [],
    ids: [],
  }) as unknown as Album

describe('recommendations against the card', () => {
  it('tells the similar artists on the card (by id, else by name read loosely) from those absent, in order', () => {
    const similar = [
      { mbid: A, name: 'Radiohead', comment: null, score: 900 },
      { mbid: B, name: 'Kite-Lines', comment: null, score: 800 },
      { mbid: C, name: 'Muse', comment: 'UK rock band', score: 700 },
      { mbid: 'd', name: 'Kite Lines', comment: null, score: 10 },
    ]
    const found = similarArtistsOnCard(similar, ['Northline', 'Kite Lines', 'Mira Sol'], (name) =>
      name === 'Northline' ? A : null,
    )
    expect(found.onCard).toEqual([
      { name: 'Northline', score: 900 },
      { name: 'Kite Lines', score: 800 },
    ])
    expect(found.absent.map((artist) => artist.name)).toEqual(['Muse'])
  })

  it("orders the artist's tracks on the card by the world's listens, each title once", () => {
    const recordings = [
      { mbid: '1', name: 'Late Train', listens: 500, listeners: 50 },
      { mbid: '2', name: 'late train', listens: 400, listeners: 40 },
      { mbid: '3', name: 'Unknown Here', listens: 300, listeners: 30 },
      { mbid: '4', name: 'Afterglow (Reprise)', listens: 200, listeners: 20 },
      { mbid: '5', name: 'Window Seat', listens: 100, listeners: 10 },
    ]
    const tracks = [track('Window Seat'), track('Afterglow (Reprise)'), track('Late Train'), track('Late Train')]
    expect(popularTracksOnCard(recordings, tracks, 2).map((item) => [item.track.title, item.listens])).toEqual([
      ['Late Train', 500],
      ['Afterglow (Reprise)', 200],
    ])
  })

  it('names the albums and EPs the card lacks, by group id else by title, singles aside', () => {
    const groups = [
      { mbid: 'g1', name: 'Afterglow', date: '2019-03-01', type: 'Album', listens: 900, listeners: 9 },
      { mbid: 'g2', name: 'Blue hours', date: '2016-01-01', type: 'Album', listens: 800, listeners: 8 },
      { mbid: 'g3', name: 'Low Tide', date: '2021-06-01', type: 'EP', listens: 700, listeners: 7 },
      { mbid: 'g4', name: 'Low Tide', date: '2021-06-01', type: 'Album', listens: 600, listeners: 6 },
      { mbid: 'g5', name: 'Late Train', date: null, type: 'Single', listens: 500, listeners: 5 },
      { mbid: 'g6', name: 'Night Songs', date: '2010', type: 'Album', listens: 400, listeners: 4 },
    ]
    const albums = [album('Afterglow'), album('Blue Hours')]
    const found = groupsNotOnCard(groups, albums, (item) => (item.title === 'Afterglow' ? 'g1' : null), 1)
    expect(found.map((group) => group.name)).toEqual(['Low Tide'])
    expect(groupsNotOnCard(groups, albums, () => null, 5).map((group) => group.mbid)).toEqual(['g3', 'g6'])
  })

  const row = (title: string, artist: string, album: string, trackNumber: number): LibraryTrack => ({
    id: title.length + trackNumber,
    title,
    artist,
    album,
    path: `/${album}/${String(trackNumber)}.flac`,
    durationMs: null,
    queuePosition: null,
    fileName: `${String(trackNumber)}.flac`,
    albumArtist: artist,
    genre: null,
    discNumber: 1,
    trackNumber,
    addedAt: null,
  })
  const blueHours = [
    row('Window Seat', 'Mira Sol', 'Blue Hours', 3),
    row('Blue Hours', 'Mira Sol', 'Blue Hours', 1),
    row('Almost Sunday', 'Mira Sol', 'Blue Hours', 2),
  ]

  it("finds a track's recording in its edition by position, else by title where titles are known", () => {
    const byPosition = [
      { recording: 'r1', title: null },
      { recording: 'r2', title: null },
      { recording: 'r3', title: null },
    ]
    expect(recordingOfTrack(blueHours, blueHours[0] as LibraryTrack, byPosition)).toBe('r3')
    expect(recordingOfTrack(blueHours, blueHours[1] as LibraryTrack, byPosition)).toBe('r1')
    // The edition has one track more: positions cannot be trusted, titles can.
    const withTitles = [...byPosition, { recording: 'r4', title: 'Bonus' }].map((item, index) => ({
      ...item,
      title: ['Blue Hours', 'Almost Sunday', 'Window seat', 'Bonus'][index] ?? null,
    }))
    expect(recordingOfTrack(blueHours, blueHours[0] as LibraryTrack, withTitles)).toBe('r3')
    expect(recordingOfTrack(blueHours, blueHours[0] as LibraryTrack, byPosition.slice(0, 2))).toBeNull()
  })

  it('lays similar recordings against the card: by recording where known, else by title and credit, the seed aside', () => {
    const tracks = [
      ...blueHours,
      row('Late Train', 'Mira Sol', 'Afterglow', 1),
      row('City Glow', 'Northline', 'Night Drive', 2),
      row('Two Voices', 'Kite Lines; Mira Sol', 'Shared Light', 1),
      row('Late Train', 'Someone Else', 'Covers', 1),
    ]
    const similar = [
      { mbid: 's1', name: 'Late train', artist: 'Mira Sol', score: 300 },
      { mbid: 's2', name: 'Mr. Brightside', artist: 'The Killers', score: 250 },
      { mbid: 's3', name: 'Two Voices', artist: 'Kite Lines', score: 200 },
      { mbid: 's4', name: 'City Glow', artist: 'Nobody', score: 150 },
      { mbid: 's5', name: 'Window Seat', artist: 'Mira Sol', score: 100 },
      { mbid: 's6', name: 'Late Train', artist: 'Mira Sol', score: 50 },
    ]
    const found = similarTracksOnCard(similar, tracks, blueHours[0] as LibraryTrack, (track) =>
      track.title === 'City Glow' ? 's4' : null,
    )
    expect(found.onCard.map((item) => [item.track.title, item.track.artist, item.score])).toEqual([
      ['Late Train', 'Mira Sol', 300],
      ['Two Voices', 'Kite Lines; Mira Sol', 200],
      ['City Glow', 'Northline', 150],
    ])
    expect(found.absent).toBe(1)
  })
})
