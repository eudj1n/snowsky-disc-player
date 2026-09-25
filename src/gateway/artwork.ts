/**
 * The stock current-track cover (GET /image/cover/ through the gateway).
 * The gateway labels proxied bodies as JSON, and the page CSP allows no
 * blob: or data: images, so covers travel as bytes: validated here as JPEG
 * or PNG and drawn onto a canvas by the UI. At most 8 MiB, as the reference.
 */
import type { GatewayHttp } from './http'

export const MAX_COVER_BYTES = 8 * 1024 * 1024

export function coverType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value))
    return 'image/png'
  return null
}

/** The current cover, or null when stock has none (empty 200) or it is not an image. */
export async function currentCover(http: GatewayHttp): Promise<Blob | null> {
  const response = await http.stockRead('/image/cover/')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!bytes.length || bytes.length > MAX_COVER_BYTES) return null
  const type = coverType(bytes)
  return type ? new Blob([bytes], { type }) : null
}
