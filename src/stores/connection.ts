/**
 * The single owner session with the player and what the gateway tells us
 * before connecting. Other stores reach the session only through
 * `activeSession()`; nothing connects without an explicit user action.
 */
import { reactive, readonly, shallowRef } from 'vue'
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
import { trackPlayback } from '../gateway/playback'
import { currentVolume, socVersion } from '../gateway/settings'
import { readTabState, writeTabState } from '../lib/storage'

export type ConnectionNotice =
  | 'gateway_unreachable'
  | 'control_busy'
  | 'incompatible'
  | 'closed_not_admitted'
  | 'closed_credential'
  | 'closed_network'
  | 'closed_stock'
  | 'closed_scanning'

const CLOSE_NOTICES: Partial<Record<CloseReason, ConnectionNotice>> = {
  'not-admitted': 'closed_not_admitted',
  credential: 'closed_credential',
  'stock-ended': 'closed_stock',
  scanning: 'closed_scanning',
}

export const http = new GatewayHttp()

let session: GatewaySession | null = null
let compatibility: Compatibility | null = null
// Reactive, so values derived from the catalog (upload bound) follow its loading.
const catalog = shallowRef<CommandCatalog | null>(null)
const openedListeners = new Set<(session: GatewaySession) => void>()

interface ConnectionModel {
  /** Whether /api/health answered; null before the first probe. */
  gateway: boolean | null
  /** The gateway serves card media (covers, durations, lyrics). */
  media: boolean
  /** The card lets the player's serial number stand in for the token. */
  snPairing: boolean
  /** The service keeps a play history and can favorite any track (next image). */
  history: boolean
  favoriteAny: boolean
  /** The service keeps the card catalog's collections and a trash (combined-008). */
  store: boolean
  trash: boolean
  connection: ConnectionState
  identity: PlayerIdentity | null
  /** currentVolume from the last 0501 read (0..120); null when unknown. */
  volume: number | null
  notice: ConnectionNotice | null
}

const state = reactive<ConnectionModel>({
  gateway: null,
  media: false,
  snPairing: false,
  history: false,
  favoriteAny: false,
  store: false,
  trash: false,
  connection: 'disconnected',
  identity: null,
  volume: null,
  notice: null,
})

export const connection = readonly(state)

export function activeSession(): GatewaySession | null {
  return session?.open ? session : null
}

export function commandCatalog(): CommandCatalog | null {
  return catalog.value
}

/** Stores that need the session (pairing, playback) register here. */
export function onSessionOpened(listener: (session: GatewaySession) => void): void {
  openedListeners.add(listener)
}

/** Health and release files; no owner session. */
export async function probeGateway(): Promise<boolean> {
  try {
    const health = await http.health()
    state.gateway = true
    state.media = health.media === true
    state.snPairing = health.snPairing === true
    state.history = health.history === true
    state.favoriteAny = health.favoriteAny === true
    state.store = health.store === true
    state.trash = health.trash === true
  } catch {
    state.gateway = false
    state.notice = 'gateway_unreachable'
    return false
  }
  const [profile, commands] = await Promise.allSettled([loadCompatibility(), loadCommands()])
  if (profile.status === 'fulfilled') compatibility = profile.value
  if (commands.status === 'fulfilled') catalog.value = commands.value
  return true
}

/**
 * A tab that was connected reconnects after its own reload (owner, round 10).
 * The mark lives in sessionStorage, so a new tab never takes control on its
 * own; an explicit Disconnect clears it. Resuming only reads: nothing that was
 * sent before the reload is sent again.
 */
const RESUME_KEY = 'disc-player.resume-session'
const RESUME_ATTEMPTS = 4
const RESUME_PAUSE_MS = 1500

export async function resumeAfterReload(pause = RESUME_PAUSE_MS): Promise<void> {
  if (readTabState(RESUME_KEY) !== '1') return
  // connect() changes the state; read it afresh after each attempt.
  const current = (): ConnectionState => state.connection
  for (let attempt = 1; attempt <= RESUME_ATTEMPTS; attempt++) {
    if (current() !== 'disconnected') return
    await connect()
    // The previous page's socket may still hold control for a moment; anything else ends the attempt.
    if (current() === 'connected' || state.notice !== 'control_busy' || attempt === RESUME_ATTEMPTS) return
    await new Promise((done) => setTimeout(done, pause))
  }
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
    // Reduce a202 records from the start, so every later listener reads the merged state.
    trackPlayback(session)
    session.onClose((reason) => {
      session = null
      state.connection = 'disconnected'
      if (reason !== 'client') state.notice = CLOSE_NOTICES[reason] ?? 'closed_network'
      // A lost network may mean the player left: recheck, so the saved copy is labelled.
      if (reason === 'network') void probeGateway()
    })
    const settings = await session.read('0501', 'a501')
    const firmware = socVersion(settings)
    state.volume = currentVolume(settings)
    const compatible = compatibility ? isCompatible(compatibility, opened.identity, firmware) : false
    state.identity = { handshake: opened.identity, firmware, compatible }
    if (!compatible) state.notice = 'incompatible'
    state.connection = 'connected'
    writeTabState(RESUME_KEY, '1')
    for (const listener of openedListeners) listener(session)
    // The play mode is known only from a102: read it once, as the reference does at connect.
    await session.read('0105', 'a102').catch(() => undefined)
  } catch (error) {
    session?.close()
    session = null
    state.connection = 'disconnected'
    state.notice ??=
      error instanceof Disconnected && error.reason === 'not-admitted' ? 'closed_not_admitted' : 'closed_network'
  }
}

/** Re-reads 0501 (currentVolume) on the open session. */
export async function refreshSettings(): Promise<void> {
  const current = activeSession()
  if (!current) return
  try {
    state.volume = currentVolume(await current.read('0501', 'a501'))
  } catch {
    state.volume = null
  }
}

export function disconnect(): void {
  writeTabState(RESUME_KEY, null)
  session?.close()
  session = null
  state.connection = 'disconnected'
  state.volume = null
}
