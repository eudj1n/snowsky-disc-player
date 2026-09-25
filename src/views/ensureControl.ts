/**
 * Connect on the first playback action (owner's decision, proposal 1): when
 * this browser holds a pairing token, pressing Play connects and pairs as
 * part of that explicit action. Without a token, or when the player is owned
 * by another client or incompatible, the connection dialog explains why and
 * nothing is sent.
 */
import { connect, connection } from '../stores/connection'
import { pairing } from '../stores/pairing'
import { openDialog } from '../stores/ui'

export async function ensureControl(): Promise<boolean> {
  if (connection.connection === 'connected' && pairing.paired) return true
  if (!pairing.stored) {
    openDialog('connection')
    return false
  }
  if (connection.connection === 'disconnected') await connect()
  if (connection.connection === 'connected' && pairing.paired && connection.identity?.compatible) return true
  openDialog('connection')
  return false
}
