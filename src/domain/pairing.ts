/** The player's serial number (About device → SN), the only pairing credential
 * since combined-008: pairing needs the player on Wi-Fi, which is set up on the
 * device itself, so there is no card token to provision. */
export const SERIAL = /^[A-Za-z0-9]{6,32}$/

/** Normalizes a typed serial number (spaces dropped); null when it cannot be one. */
export function normalizeSerial(value: string): string | null {
  const compact = value.replace(/\s+/g, '')
  return SERIAL.test(compact) ? compact : null
}
