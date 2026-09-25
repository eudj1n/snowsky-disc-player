/**
 * Library scan after the reference Controller (importing.py scan): one
 * 0622 0000 start, then only observation of the session's events: a60a 000F
 * marks the start, a622 carries the discovered count, a60a 0005 after the
 * start is the observed end. No restart, cancel or reset; a missing end
 * within the deadline is uncertain (the player may still be scanning).
 */
import type { GatewaySession } from './session'

export type ScanOutcome =
  | { status: 'confirmed'; discovered: number | null }
  | { status: 'not-sent' }
  | { status: 'uncertain'; discovered: number | null }

export interface ScanDeps {
  session: GatewaySession
  guard: () => void
  attempted: () => void
  onProgress?: (discovered: number) => void
  timeoutMs?: number
}

export function scanLibrary(deps: ScanDeps): Promise<ScanOutcome> {
  return new Promise((resolve) => {
    try {
      deps.guard()
    } catch {
      resolve({ status: 'not-sent' })
      return
    }
    let started = false
    let discovered: number | null = null
    let done = false
    const finish = (outcome: ScanOutcome) => {
      if (done) return
      done = true
      clearTimeout(timer)
      stopRecords()
      stopClose()
      resolve(outcome)
    }
    const stopRecords = deps.session.onRecord(({ tag, payload }) => {
      if (tag === 'a60a') {
        const value = parseInt(payload, 16)
        if (value === 0x0f) started = true
        else if (value === 0x05 && started) finish({ status: 'confirmed', discovered })
      } else if (tag === 'a622' && started && /^[0-9a-fA-F]{1,8}$/.test(payload)) {
        discovered = parseInt(payload, 16)
        deps.onProgress?.(discovered)
      }
    })
    const stopClose = deps.session.onClose(() => finish({ status: 'uncertain', discovered }))
    const timer = setTimeout(() => finish({ status: 'uncertain', discovered }), deps.timeoutMs ?? 300_000)
    deps.attempted()
    void deps.session.mutate('0622', '0000', null).then((sent) => {
      if (sent.status === 'unsent') finish({ status: 'not-sent' })
    })
  })
}
