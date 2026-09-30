import { describe, expect, it } from 'vitest'
import { listArtists, listBackground, titleSize } from '../../src/domain/listArt'

describe('automatic playlist covers', () => {
  it('give each list that is not an artist’s its own palette, and an artist’s list one by its name', () => {
    const kinds = ['most_played', 'daily_mix', 'recently_added', 'not_played_lately'] as const
    expect(new Set(kinds.map((kind) => listBackground(kind, 'x'))).size).toBe(4)
    expect(listBackground('artist_most_played', 'Most played · Lumen')).toBe(
      listBackground('artist_most_played', 'Most played · Lumen'),
    )
    expect(listBackground('most_played', 'a')).toMatch(/^radial-gradient\(.+, #f5a02e$/)
  })

  it('name the artists a list holds most, joint credits for each', () => {
    const tracks = new Map([
      ['/a', { artist: 'Lumen' }],
      ['/b', { artist: 'Lumen; Kestrel' }],
      ['/c', { artist: 'Kestrel' }],
      ['/d', { artist: 'Forma' }],
    ])
    expect(listArtists(['/a', '/b', '/c', '/d', '/gone'], tracks, 2)).toEqual({
      names: ['Lumen', 'Kestrel'],
      more: true,
    })
    expect(listArtists(['/d'], tracks)).toEqual({ names: ['Forma'], more: false })
  })

  it('size a title so its longest word fits the card', () => {
    expect(titleSize('Daily mix')).toBe(13)
    expect(titleSize('Самое прослушиваемое')).toBeCloseTo(138 / 14)
  })
})
