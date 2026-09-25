/**
 * FiiO record framing used on the gateway WebSocket: four lowercase hex tag
 * digits, four uppercase hex digits of the total UTF-8 length (header
 * included), then the payload. See the gateway contract in snowsky-disc-service.
 */
export interface DiscRecord {
  tag: string
  payload: string
}

export const MAX_RECORD_BYTES = 65535
const TAG = /^[0-9a-f]{4}$/i
const HEADER = /^[0-9a-f]{8}/i
const encoder = new TextEncoder()

export function byteLength(text: string): number {
  return encoder.encode(text).length
}

export function encodeRecord(tag: string, payload = ''): string {
  if (!TAG.test(tag)) throw new RangeError(`Invalid record tag: ${tag}`)
  const size = 8 + byteLength(payload)
  if (size > MAX_RECORD_BYTES) throw new RangeError('Record exceeds 65535 bytes')
  return tag.toLowerCase() + size.toString(16).toUpperCase().padStart(4, '0') + payload
}

export function decodeRecord(text: string): DiscRecord {
  if (!HEADER.test(text)) throw new SyntaxError('Record header is not hexadecimal')
  if (parseInt(text.slice(4, 8), 16) !== byteLength(text))
    throw new SyntaxError('Record length does not match its header')
  return { tag: text.slice(0, 4).toLowerCase(), payload: text.slice(8) }
}
