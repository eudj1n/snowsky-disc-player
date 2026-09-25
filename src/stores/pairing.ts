/** The card pairing token (or the player's serial number where the card
 * allows it), kept in this browser only. Rotating or deleting DISC_WEB_TOKEN,
 * or removing DISC_WEB_SN_PAIRING, on the card revokes it at the gateway. */
import { reactive, readonly } from 'vue'
import { normalizeCredential } from '../domain/pairing'
import type { GatewaySession } from '../gateway/session'
import { readPreference, writePreference } from '../lib/storage'
import { activeSession, connection, onSessionOpened } from './connection'

const KEY = 'disc-player.token'
/** The form admits a serial number only when the gateway reports SN pairing. */
const stored = (): string | null => normalizeCredential(readPreference(KEY) ?? '', true)
const state = reactive({ stored: stored() !== null, paired: false })
export const pairing = readonly(state)

function pair(session: GatewaySession): void {
  const token = stored()
  state.paired = false
  if (token && connection.identity?.compatible) {
    session.pair(token)
    state.paired = true
  }
  session.onClose((reason) => {
    state.paired = false
    // Refused at once: forget it, so reconnecting does not spend the gateway's
    // attempt limit (five failures lock this address out for ten minutes).
    if (reason === 'credential') forgetToken()
  })
}
onSessionOpened(pair)

export function saveToken(value: string): boolean {
  const token = normalizeCredential(value, true)
  if (!token) return false
  writePreference(KEY, token)
  state.stored = true
  const session = activeSession()
  if (session && !session.isPaired) pair(session)
  return true
}

/** The stored credential for HTTP mutations (uploads). */
export function pairingToken(): string | null {
  return stored()
}

export function forgetToken(): void {
  writePreference(KEY, null)
  state.stored = false
}
