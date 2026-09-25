/**
 * Uploading one file through the gateway (POST /api/stock/audio/tmp/sdcard/…).
 * The gateway itself writes the file on the card (hidden staging file,
 * exclusive create, fsync, rename, parents created) and answers 201 with the
 * published path and byte count; stock's upload handler is not involved.
 * Unlike stock's HTTP 200, this reply comes from our own writer after the
 * rename, so a 201 whose path and size match is the confirmation. A lost
 * reply after the body started is uncertain and is never retried.
 */
import { CARD_ROOT } from '../domain/imports'
import { requestId as newRequestId } from './ids'

export type UploadOutcome = 'confirmed' | 'exists' | 'not-sent' | 'uncertain'

export interface UploadRequest {
  file: Blob
  /** Relative path below the card root, e.g. Album/01 Track.flac. */
  path: string
  token: string
  onProgress?: (sent: number, total: number) => void
  /** Injectable for tests. */
  xhr?: () => XMLHttpRequest
}

export function uploadUrl(path: string): string {
  return `/api/stock/audio${CARD_ROOT}${path.split('/').map(encodeURIComponent).join('/')}`
}

export function uploadOutcome(status: number, body: string, path: string, size: number): UploadOutcome {
  if (status === 201) {
    try {
      const reply = JSON.parse(body) as { path?: unknown; bytes?: unknown }
      return reply.path === CARD_ROOT + path && reply.bytes === size ? 'confirmed' : 'uncertain'
    } catch {
      return 'uncertain'
    }
  }
  if (status === 409 && /exists|appeared/i.test(body)) return 'exists'
  if ([400, 403, 409, 413, 503, 507].includes(status)) return 'not-sent'
  return 'uncertain'
}

export function uploadFile(request: UploadRequest): Promise<UploadOutcome> {
  return new Promise((resolve) => {
    const xhr = request.xhr?.() ?? new XMLHttpRequest()
    let started = false
    xhr.open('POST', uploadUrl(request.path))
    xhr.timeout = 330_000
    xhr.setRequestHeader('X-Disc-Token', request.token)
    xhr.setRequestHeader('X-Disc-Request', newRequestId())
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.upload.onprogress = (event) => {
      started = true
      request.onProgress?.(event.loaded, event.total || request.file.size)
    }
    xhr.onload = () => resolve(uploadOutcome(xhr.status, xhr.responseText, request.path, request.file.size))
    const lost = () => resolve(started ? 'uncertain' : 'not-sent')
    xhr.onerror = lost
    xhr.ontimeout = () => resolve('uncertain')
    xhr.onabort = lost
    xhr.send(request.file)
  })
}
