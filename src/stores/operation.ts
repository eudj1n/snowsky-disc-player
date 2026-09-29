/**
 * One device operation at a time (reference operation lease). Mutations wait
 * for the pacer before their preflight, and `guard()` refuses to send once
 * scan activity was observed during the operation.
 *
 * A second request while one runs is refused, unless it asks to wait (the
 * player's controls and playing from the collection; owner, 2026-09-29: the
 * whole page froze while the player confirmed a pause). One request waits at
 * most: a newer one takes its place and the older one is `superseded`. It
 * starts when the running operation ends, with its own pacing and preflight,
 * and is `dropped` unsent when that operation's outcome is uncertain, so
 * nothing follows a command whose effect is unknown.
 */
import { reactive, readonly } from 'vue'
import { MutationPacer, ScanObserved } from '../gateway/pacer'
import type { GatewaySession } from '../gateway/session'
import { activeSession, onSessionOpened } from './connection'
import { observations } from './observations'

const state = reactive({
  busy: false,
  name: null as string | null,
  /** The request waiting for the running one, if any. */
  waiting: null as string | null,
})
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
/** A waiting request replaced by a newer one; nothing was sent for it. */
export type Superseded = 'superseded'
/** A waiting request not sent because the operation before it ended uncertain. */
export type Dropped = 'dropped'

interface Waiting {
  name: string
  start: () => void
  end: (why: Superseded | Dropped) => void
}
let waiting: Waiting | null = null

export function run<T>(name: string, task: (context: OperationContext) => Promise<T>): Promise<T | Busy | NoSession>
export function run<T>(
  name: string,
  task: (context: OperationContext) => Promise<T>,
  options: { wait: true },
): Promise<T | Busy | NoSession | Superseded | Dropped>
export async function run<T>(
  name: string,
  task: (context: OperationContext) => Promise<T>,
  options: { wait?: boolean } = {},
): Promise<T | Busy | NoSession | Superseded | Dropped> {
  const session = activeSession()
  if (!session) return 'no-session'
  if (state.busy) {
    if (!options.wait) return 'busy'
    return new Promise((resolve) => {
      waiting?.end('superseded')
      waiting = { name, start: () => void run(name, task, { wait: true }).then(resolve), end: resolve }
      state.waiting = name
    })
  }
  state.busy = true
  state.name = name
  const events = observations.scanEvents
  let uncertain = true
  try {
    const result = await task({
      session,
      pace: () => pacer.wait(),
      guard: () => {
        if (observations.scanActive || observations.scanEvents !== events) throw new ScanObserved()
      },
      attempted: () => pacer.attempted(),
    })
    uncertain = result === 'uncertain'
    return result
  } finally {
    state.busy = false
    state.name = null
    const next = waiting
    waiting = null
    state.waiting = null
    if (next && uncertain) next.end('dropped')
    else next?.start()
  }
}
