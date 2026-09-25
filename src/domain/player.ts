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

/** Stock volume range (reference 0..120). */
export const VOLUME_MAX = 120
/** Unmute level when no earlier level is remembered: deliberately quiet. */
export const UNMUTE_FALLBACK = 20

/**
 * The stock has no mute command, so muting sets volume 0 and remembers the
 * level it replaced; unmuting restores that level (or a quiet fallback).
 * An unknown volume cannot be toggled.
 */
export function muteStep(
  volume: number | null,
  remembered: number | null,
): { target: number; remember: number | null } | null {
  if (volume === null) return null
  if (volume > 0) return { target: 0, remember: volume }
  const restore = remembered !== null && remembered > 0 && remembered <= VOLUME_MAX ? remembered : UNMUTE_FALLBACK
  return { target: restore, remember: remembered }
}
