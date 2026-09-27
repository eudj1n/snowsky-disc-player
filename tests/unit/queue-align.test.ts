import { describe, expect, it } from 'vitest'
import { alignQueue } from '../../src/domain/queue'
import type { LibraryTrack } from '../../src/domain/track'

let nextId = 1
const track = (title: string, artist: string, path: string): LibraryTrack => ({
  id: nextId++,
  title,
  artist,
  album: 'Album',
  albumArtist: null,
  genre: null,
  discNumber: null,
  trackNumber: null,
  addedAt: null,
  queuePosition: null,
  path,
  durationMs: null,
  fileName: path.split('/').at(-1) ?? path,
})

describe('queue rows behind the stock queue', () => {
  const a = track('Numb', 'LP', '/tmp/sdcard/A/01 Numb.flac')
  const b = track('Faint', 'LP', '/tmp/sdcard/A/02 Faint.flac')
  const live = track('Numb', 'LP', '/tmp/sdcard/Live/Numb.flac')

  it('takes the persisted queue as it is when every position agrees', () => {
    const rows = [
      { name: 'Numb', author: 'LP' },
      { name: 'Faint', author: 'LP' },
    ]
    expect(alignQueue(rows, [a, b], [])).toEqual([a, b])
    // Stock shows an untagged file by its name.
    expect(alignQueue([{ name: '01 Numb.flac', author: null }], [a], [])).toEqual([a])
  })

  it('otherwise matches each row once, in the queue first and then in the library', () => {
    const rows = [
      { name: 'Faint', author: 'LP' },
      { name: 'Numb', author: 'LP' },
    ]
    // A persisted queue in another order (or a changed one) is not taken by position.
    expect(alignQueue(rows, [a, b], [a, b, live])).toEqual([b, a])
    // Without it, a title two files share stays unknown rather than guessed.
    expect(alignQueue(rows, [], [a, b, live])).toEqual([b, null])
    expect(alignQueue([{ name: 'Unknown', author: null }], [], [a])).toEqual([null])
  })
})
