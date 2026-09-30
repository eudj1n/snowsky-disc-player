/**
 * Playing an M3U list on the player (combined-009, docs/m3u.md of the
 * service): `0101` with list type `0004` and the list's card path, the folder
 * play the card catalog admits, makes stock read the list into its queue and
 * play its first entry. The list is read twice before the send (it must not
 * change in between, nor be empty) and the play is confirmed by the playing
 * file: the first entry, or with a position `0100` and that entry.
 */
import { readList, type ListScope } from './lists'
import { mergePlayback, playbackOf, readPlaybackWire, type PlaybackWire } from './playback'
import type { SelectionDeps, SelectionOutcome } from './selection'
import { NoObservation } from './session'

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((entry, i) => entry === b[i])

const hex4 = (value: number) => value.toString(16).toUpperCase().padStart(4, '0')

export async function selectList(
  deps: SelectionDeps,
  scope: ListScope,
  name: string,
  position?: number,
): Promise<SelectionOutcome> {
  const { session, http, timeoutMs } = deps
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)))
  let path: string
  let first: string
  try {
    const list = await readList(http, scope, name)
    const again = await readList(http, scope, name)
    if (!list || !again || list.path !== again.path || !same(list.entries, again.entries)) return 'changed'
    const entry = list.entries[position ?? 0]
    if (entry === undefined) return list.entries.length ? 'changed' : 'unavailable'
    path = list.path
    first = entry
  } catch {
    return 'changed'
  }
  try {
    deps.guard?.()
  } catch {
    return 'unavailable'
  }
  deps.attempted?.()
  const outcome =
    position === undefined
      ? await session.mutate('0101', `0004${path}`, null, timeoutMs)
      : await session.mutate('0100', `${hex4(position)}0004${path}`, null, timeoutMs)
  if (outcome.status === 'unsent') return 'unavailable'
  const deadline = now() + (deps.confirmMs ?? 8000)
  let seen: PlaybackWire = {}
  while (now() < deadline && session.open) {
    try {
      seen = mergePlayback(seen, await readPlaybackWire(session))
      const observed = playbackOf(seen)
      if (observed.state === 'playing' && observed.track?.path === first) return 'playing'
    } catch (error) {
      if (!(error instanceof NoObservation)) break
    }
    await sleep(deps.pauseMs ?? 150)
  }
  return 'uncertain'
}
