/** Request IDs for mutations: 32 URL-safe characters from the platform CSPRNG.
 * crypto.getRandomValues works on plain-HTTP LAN origins, unlike randomUUID. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
export const REQUEST_ID = /^[A-Za-z0-9_-]{16,64}$/

export function requestId(length = 32): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let id = ''
  for (const byte of bytes) id += ALPHABET.charAt(byte & 63)
  return id
}
