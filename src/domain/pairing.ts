/** The card pairing token: one line of 32..64 URL-safe characters in
 * DISC_WEB_TOKEN on the player's memory card. */
export const TOKEN = /^[A-Za-z0-9_-]{32,64}$/

/** The player's serial number (About device → SN). Gateways accept it in place
 * of the token only while the card carries DISC_WEB_SN_PAIRING. */
export const SERIAL = /^[A-Za-z0-9]{6,32}$/

/** Normalizes a pasted token or, when the gateway allows it, a typed serial
 * number (spaces dropped); null when it cannot be either. */
export function normalizeCredential(value: string, serial: boolean): string | null {
  const token = value.trim()
  if (TOKEN.test(token)) return token
  const compact = token.replace(/\s+/g, '')
  return serial && SERIAL.test(compact) ? compact : null
}

/** Normalizes a pasted token; null when it cannot be one. */
export function normalizeToken(value: string): string | null {
  return normalizeCredential(value, false)
}
