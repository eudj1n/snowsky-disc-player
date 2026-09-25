/** The card pairing token: one line of 32..64 URL-safe characters in
 * DISC_WEB_TOKEN on the player's memory card. */
export const TOKEN = /^[A-Za-z0-9_-]{32,64}$/

/** Normalizes a pasted token; null when it cannot be one. */
export function normalizeToken(value: string): string | null {
  const token = value.trim()
  return TOKEN.test(token) ? token : null
}
