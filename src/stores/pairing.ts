/** The card pairing token, kept in this browser only. Rotating or deleting
 * DISC_WEB_TOKEN on the card revokes it at the gateway. */
import { reactive, readonly } from 'vue'
import { normalizeToken } from '../domain/pairing'
import type { GatewaySession } from '../gateway/session'
import { readPreference, writePreference } from '../lib/storage'
import { activeSession, connection, onSessionOpened } from './connection'

const KEY = 'disc-player.token'
const state = reactive({ stored: normalizeToken(readPreference(KEY) ?? '') !== null, paired: false })
export const pairing = readonly(state)

function pair(session: GatewaySession): void {
  const token = normalizeToken(readPreference(KEY) ?? '')
  state.paired = false
  if (token && connection.identity?.compatible) {
    session.pair(token)
    state.paired = true
  }
  session.onClose(() => (state.paired = false))
}
onSessionOpened(pair)

export function saveToken(value: string): boolean {
  const token = normalizeToken(value)
  if (!token) return false
  writePreference(KEY, token)
  state.stored = true
  const session = activeSession()
  if (session && !session.isPaired) pair(session)
  return true
}

export function forgetToken(): void {
  writePreference(KEY, null)
  state.stored = false
}
