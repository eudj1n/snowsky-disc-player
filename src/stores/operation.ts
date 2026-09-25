/**
 * One device operation at a time (reference operation lease): a second
 * request while one runs is refused, not queued. Mutations wait for the
 * pacer before their preflight, and `guard()` refuses to send once scan
 * activity was observed during the operation.
 */
import { reactive, readonly } from 'vue'
import { MutationPacer, ScanObserved } from '../gateway/pacer'
import type { GatewaySession } from '../gateway/session'
import { activeSession, onSessionOpened } from './connection'
import { observations } from './observations'

const state = reactive({ busy: false, name: null as string | null })
export const operation = readonly(state)

let pacer = new MutationPacer()
onSessionOpened(() => {
  pacer = new MutationPacer()
})

export interface OperationContext {
  session: GatewaySession
  /** Waits for the mutation interval; call before preflight reads. */
  pace: () => Promise<void>
  /** Throws ScanObserved when a scan is active or was seen since the start. */
  guard: () => void
  /** Marks the one mutation attempt of this operation, right before sending. */
  attempted: () => void
}

export type Busy = 'busy'
export type NoSession = 'no-session'

export async function run<T>(
  name: string,
  task: (context: OperationContext) => Promise<T>,
): Promise<T | Busy | NoSession> {
  const session = activeSession()
  if (!session) return 'no-session'
  if (state.busy) return 'busy'
  state.busy = true
  state.name = name
  const events = observations.scanEvents
  try {
    return await task({
      session,
      pace: () => pacer.wait(),
      guard: () => {
        if (observations.scanActive || observations.scanEvents !== events) throw new ScanObserved()
      },
      attempted: () => pacer.attempted(),
    })
  } finally {
    state.busy = false
    state.name = null
  }
}
