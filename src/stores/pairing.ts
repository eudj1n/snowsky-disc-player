/** The player's serial number, the pairing credential since combined-008,
 * kept in this browser only and sent as the gateway's X-Disc-Token. The
 * gateway compares it with the player's own at every change. */
import { reactive, readonly } from 'vue'
import { normalizeSerial } from '../domain/pairing'
import type { GatewaySession } from '../gateway/session'
import { readPreference, writePreference } from '../lib/storage'
import { activeSession, connection, onSessionOpened } from './connection'

// A new key: a card token kept by an earlier page is never sent to a gateway
// that only knows the SN (every refusal counts against the attempt limit).
const KEY = 'disc-player.serial'
const stored = (): string | null => normalizeSerial(readPreference(KEY) ?? '')
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
  const token = normalizeSerial(value)
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
