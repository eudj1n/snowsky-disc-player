import { describe, expect, it } from 'vitest'
import { compareTracklists, type ListedTrack } from '../../src/domain/tracklists'

const track = (title: string, lengthMs: number | null, number: string | null = null, disc: number | null = 1) =>
  ({ disc, number, title, lengthMs }) satisfies ListedTrack

describe('an edition beside the album on the card', () => {
  it('pairs rows by place and marks the titles and lengths of the edition that differ', () => {
    const { proposed, current } = compareTracklists(
      [track('Orbit', 200_000, '1'), track('Weightless', 180_000, '2'), track('Drift (Live)', 240_000, '3')],
      [track('orbit', 201_500, '1'), track('Weightless', 190_000, '2')],
    )
    expect(proposed.rows.map((row) => [row.titleDiffers, row.lengthDiffers])).toEqual([
      [false, false],
      [false, true],
      [true, false],
    ])
    expect(current.rows.map((row) => row.titleDiffers || row.lengthDiffers)).toEqual([false, false])
    expect(proposed.lengthMs).toBe(620_000)
    expect(current.lengthMs).toBe(391_500)
  })

  it('compares titles by letters and digits, case and accents aside', () => {
    const { proposed } = compareTracklists(
      [track('Café — Noir!', null), track('Track 2', null)],
      [track('cafe noir', 1000), track('Track 3', 1000)],
    )
    expect(proposed.rows.map((row) => [row.titleDiffers, row.lengthDiffers])).toEqual([
      [false, false],
      [true, false],
    ])
    // An unknown length is neither summed nor compared.
    expect(proposed.lengthMs).toBeNull()
  })

  it('marks the card rows the edition lacks, once its tracks are known', () => {
    const tracks = [track('One', 1000), track('Two', 1000)]
    expect(compareTracklists([track('One', 1000)], tracks).current.rows.map((row) => row.titleDiffers)).toEqual([
      false,
      true,
    ])
    expect(compareTracklists([], tracks).current.rows.map((row) => row.titleDiffers)).toEqual([false, false])
  })

  it('names the disc in the label only when the list spans several', () => {
    const { proposed, current } = compareTracklists(
      [track('One', null, '1', 1), track('Two', null, 'A1', 2)],
      [track('One', null, '1', null), track('Two', null, null, 1)],
    )
    expect(proposed.rows.map((row) => row.label)).toEqual(['1·1', '2·A1'])
    expect(current.rows.map((row) => row.label)).toEqual(['1', ''])
  })
})
