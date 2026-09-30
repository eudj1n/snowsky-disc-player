import { describe, expect, it } from 'vitest'
import { MODE, nextMode } from '../../src/stores/controls'

describe('play modes (stock keeps one)', () => {
  it('turns shuffle on and off, and moves repeat round: the queue, one track, off', () => {
    expect(nextMode('shuffle', MODE.listOnce)).toBe(MODE.random)
    expect(nextMode('shuffle', MODE.random)).toBe(MODE.listOnce)
    expect(nextMode('repeat', MODE.listOnce)).toBe(MODE.repeatList)
    expect(nextMode('repeat', MODE.repeatList)).toBe(MODE.repeatOne)
    expect(nextMode('repeat', MODE.repeatOne)).toBe(MODE.listOnce)
    // Repeat from shuffle (or an unknown mode) starts at the queue.
    expect(nextMode('repeat', MODE.random)).toBe(MODE.repeatList)
    expect(nextMode('repeat', null)).toBe(MODE.repeatList)
  })
})
