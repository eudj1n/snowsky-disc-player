import { describe, expect, it } from 'vitest'
import { pinnedFirst } from '../../src/stores/pins'

describe('pins', () => {
  it('puts pinned items first, newest pin first, and keeps the rest in order', () => {
    const at = new Map([
      ['c', 10],
      ['a', 20],
    ])
    expect(pinnedFirst(['a', 'b', 'c', 'd'], (item) => at.get(item) ?? null)).toEqual(['a', 'c', 'b', 'd'])
    expect(pinnedFirst(['x', 'y'], () => null)).toEqual(['x', 'y'])
  })
})
