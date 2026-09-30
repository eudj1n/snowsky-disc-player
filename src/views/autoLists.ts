/**
 * Listening to a list that is not an artist's (owner, 2026-09-30): the first
 * listen writes it to the player, then it plays there, one tap; nothing is
 * written to the card before someone wants to hear it.
 */
import type { GlobalKind } from '../domain/autoPlaylists'
import { kindList, makeKindList } from '../stores/autoPlaylists'
import { playFrom } from './playAlbum'

/** Plays the list of this kind on the player, from a position when given, writing it first when it is not there. */
export async function listenToKind(kind: GlobalKind, position?: number): Promise<string | null> {
  let list = kindList(kind)
  if (!list) {
    if (!(await makeKindList(kind, true))) return null
    list = kindList(kind)
    if (!list) return null
  }
  await playFrom({ kind: 'list', scope: 'external', name: list.name, ...(position === undefined ? {} : { position }) })
  return list.name
}
