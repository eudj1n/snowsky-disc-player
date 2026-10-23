import { describe, expect, it } from 'vitest'
import type { Album } from '../../src/domain/album'
import { groupsNotOnCard, popularTracksOnCard, similarArtistsOnCard } from '../../src/domain/recommendations'
import type { Track } from '../../src/domain/track'

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
})
