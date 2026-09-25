/** The connected player as the app knows it. */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected'

export interface PlayerIdentity {
  /** a599 handshake value, e.g. 0306. */
  handshake: string
  /** Main OS number from 0501, e.g. 257 for V2.57. */
  firmware: number | null
  /** Whether it matches the reviewed profile this release was built for. */
  compatible: boolean
}
