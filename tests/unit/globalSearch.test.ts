import { describe, expect, it } from 'vitest'
import { indexOf, normalize, rank } from '../../src/domain/globalSearch'

const names = (items: readonly string[]) => indexOf(items, (name) => [name])

describe('global search', () => {
  it('compares without case, diacritics or ё', () => {
    expect(normalize('  Sigur   Rós ')).toBe('sigur ros')
    expect(normalize('Ёлка')).toBe('елка')
    expect(normalize('Mỹ Tâm')).toBe('my tam')
    expect(rank(names(['Björk']), 'BJORK')).toEqual([{ item: 'Björk', score: 100 }])
    expect(rank(names(['Ёлка']), 'елк')).toHaveLength(1)
  })

  it('ranks a name equal to the query, then its start, then a word, then any match', () => {
    const found = rank(names(['Evening Light', 'Light', 'Lighthouse', 'Moonlight', 'Night Drive', 'Light']), 'light')
    expect(found.map((entry) => entry.item)).toEqual(['Light', 'Light', 'Lighthouse', 'Evening Light', 'Moonlight'])
    expect(rank(names(['Mixed-Up', 'Up']), 'up').map((entry) => entry.item)).toEqual(['Up', 'Mixed-Up'])
  })

  it('needs every word, in the name or the other fields, the more in the name the better', () => {
    const tracks = [
      { title: 'First Light', artist: 'Northline', album: 'Afterglow' },
      { title: 'Afterglow', artist: 'Northline', album: 'Afterglow' },
      { title: 'Late Train', artist: 'Mira Sol', album: 'Afterglow' },
    ]
    const index = indexOf(tracks, (track) => [track.title, track.artist, track.album])
    expect(rank(index, 'northline after').map((entry) => entry.item.title)).toEqual(['Afterglow', 'First Light'])
    expect(rank(index, '   ')).toEqual([])
    expect(rank(index, 'mira moon')).toEqual([])
  })
})
