import { describe, expect, it } from 'vitest'
import { queueRowOf } from '../../src/domain/queue'

const rows = [{ name: 'Blue Hours' }, { name: 'Almost Sunday' }, { name: 'Window Seat' }, { name: 'Almost Sunday' }]
const details = rows.map((row, index) => ({
  path: `/tmp/sdcard/Mira Sol - Blue Hours/0${String(index + 1)} ${row.name}.flac`,
  title: row.name,
}))
const track = (index: number, queuePosition: number | null) => ({
  path: details[index]?.path ?? null,
  title: details[index]?.title ?? '',
  queuePosition,
})
describe('the playing row of the shown queue', () => {
  it('follows the position stock reports when that row is the track', () => {
    expect(queueRowOf(rows, details, track(2, 2))).toBe(2)
    // A repeated title is told apart by its position or its file.
    expect(queueRowOf(rows, details, track(3, 3))).toBe(3)
    expect(queueRowOf(rows, details, track(1, null))).toBe(1)
  })

  it('finds the track by its file when the position is stale, and nothing when it is not in the queue', () => {
    expect(queueRowOf(rows, details, track(2, 0))).toBe(2)
    expect(queueRowOf(rows, details, { path: '/tmp/sdcard/Other/01 X.flac', title: 'X', queuePosition: 0 })).toBeNull()
    expect(queueRowOf(rows, details, null)).toBeNull()
  })

  it('matches by name where the queue has no library rows, stock cutting long names', () => {
    const cut = [{ name: 'An Unusually Long Track Title' }]
    expect(
      queueRowOf(cut, [null], {
        path: '/tmp/sdcard/x.flac',
        title: 'An Unusually Long Track Title for the Play State',
        queuePosition: 0,
      }),
    ).toBe(0)
  })
})
