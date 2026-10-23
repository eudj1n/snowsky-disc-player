import { describe, expect, it } from 'vitest'
import { artistsTaggedWith, relatedGenres, tagIsGenre, topTags, type WeightedTag } from '../../src/domain/tags'

const tag = (name: string, count: number, genre = true): WeightedTag => ({ tag: name, count, genre })
const byArtist = new Map<string, WeightedTag[]>([
  ['Mira Sol', [tag('jazz', 12), tag('ambient', 5), tag('vocal jazz', 4), tag('british', 3, false)]],
  ['Northline', [tag('electronic', 20), tag('ambient', 9), tag('downtempo', 6)]],
  ['Forma', [tag('Ambient', 30), tag('drone', 2)]],
  ['Sundial', [tag('indie rock', 7)]],
])

describe("the community's tags", () => {
  it('takes the most given tags, genres only unless asked, ties by name', () => {
    expect(topTags(byArtist.get('Mira Sol') ?? [], 2).map((item) => item.tag)).toEqual(['jazz', 'ambient'])
    expect(topTags([tag('b', 1), tag('a', 1), tag('c', 1, false)], 5, false).map((item) => item.tag)).toEqual([
      'a',
      'b',
      'c',
    ])
    expect(tagIsGenre('Vocal  Jazz', 'vocal jazz')).toBe(true)
  })

  it('names the artists the listeners tag with a genre the card lists them elsewhere, the most agreed first', () => {
    expect(artistsTaggedWith(byArtist, 'Ambient', new Set(['Forma']))).toEqual([
      { name: 'Northline', count: 9 },
      { name: 'Mira Sol', count: 5 },
    ])
    expect(artistsTaggedWith(byArtist, 'Jazz', new Set(['Mira Sol']))).toEqual([])
  })

  it('relates genres by the artists carrying both, the most shared first, the genre itself and plain tags aside', () => {
    expect(relatedGenres(byArtist, 'ambient', 3)).toEqual([
      { tag: 'electronic', artists: 1 },
      { tag: 'jazz', artists: 1 },
      { tag: 'downtempo', artists: 1 },
    ])
    expect(relatedGenres(byArtist, 'indie rock', 3)).toEqual([])
    const shared = new Map<string, WeightedTag[]>([
      ['A', [tag('rock', 1), tag('pop', 1)]],
      ['B', [tag('rock', 1), tag('pop', 1), tag('folk', 9)]],
    ])
    expect(relatedGenres(shared, 'folk', 3)).toEqual([
      { tag: 'pop', artists: 1 },
      { tag: 'rock', artists: 1 },
    ])
    expect(relatedGenres(shared, 'rock', 3)[0]).toEqual({ tag: 'pop', artists: 2 })
  })
})
