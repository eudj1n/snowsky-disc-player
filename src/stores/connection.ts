/**
 * The single owner session with the player and what the gateway tells us
 * before connecting. Other stores reach the session only through
 * `activeSession()`; nothing connects without an explicit user action.
 */
import { reactive, readonly } from 'vue'
import type { ConnectionState, PlayerIdentity } from '../domain/player'
import { GatewayHttp } from '../gateway/http'
import {
  isCompatible,
  loadCommands,
  loadCompatibility,
  type CommandCatalog,
  type Compatibility,
} from '../gateway/release'
import { Disconnected, GatewaySession, type CloseReason } from '../gateway/session'
import { socVersion } from '../gateway/settings'

export type ConnectionNotice =
  'gateway_unreachable' | 'control_busy' | 'incompatible' | 'closed_not_admitted' | 'closed_network' | 'closed_stock'

const CLOSE_NOTICES: Partial<Record<CloseReason, ConnectionNotice>> = {
  'not-admitted': 'closed_not_admitted',
  'stock-ended': 'closed_stock',
}

export const http = new GatewayHttp()

let session: GatewaySession | null = null
let compatibility: Compatibility | null = null
let catalog: CommandCatalog | null = null
const openedListeners = new Set<(session: GatewaySession) => void>()

interface ConnectionModel {
  /** Whether /api/health answered; null before the first probe. */
  gateway: boolean | null
  connection: ConnectionState
  identity: PlayerIdentity | null
  notice: ConnectionNotice | null
}

const state = reactive<ConnectionModel>({ gateway: null, connection: 'disconnected', identity: null, notice: null })

export const connection = readonly(state)

export function activeSession(): GatewaySession | null {
  return session?.open ? session : null
}

export function commandCatalog(): CommandCatalog | null {
  return catalog
}

/** Stores that need the session (pairing, playback) register here. */
export function onSessionOpened(listener: (session: GatewaySession) => void): void {
  openedListeners.add(listener)
}

/** Health and release files; no owner session. */
export async function probeGateway(): Promise<boolean> {
  try {
    await http.health()
    state.gateway = true
  } catch {
    state.gateway = false
    state.notice = 'gateway_unreachable'
    return false
  }
  const [profile, commands] = await Promise.allSettled([loadCompatibility(), loadCommands()])
  if (profile.status === 'fulfilled') compatibility = profile.value
  if (commands.status === 'fulfilled') catalog = commands.value
  return true
}

function socketUrl(): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/websocket`
}

export async function connect(): Promise<void> {
  if (state.connection !== 'disconnected') return
  state.notice = null
  state.connection = 'connecting'
  try {
    if ((await http.health()).controlActive) {
      state.notice = 'control_busy'
      state.connection = 'disconnected'
      return
    }
    const opened = await GatewaySession.open(socketUrl())
    session = opened.session
    session.onClose((reason) => {
      session = null
      state.connection = 'disconnected'
      if (reason !== 'client') state.notice = CLOSE_NOTICES[reason] ?? 'closed_network'
    })
    const firmware = socVersion(await session.read('0501', 'a501'))
    const compatible = compatibility ? isCompatible(compatibility, opened.identity, firmware) : false
    state.identity = { handshake: opened.identity, firmware, compatible }
    if (!compatible) state.notice = 'incompatible'
    state.connection = 'connected'
    for (const listener of openedListeners) listener(session)
  } catch (error) {
    session?.close()
    session = null
    state.connection = 'disconnected'
    state.notice ??=
      error instanceof Disconnected && error.reason === 'not-admitted' ? 'closed_not_admitted' : 'closed_network'
  }
}

export function disconnect(): void {
  session?.close()
  session = null
  state.connection = 'disconnected'
}
