/**
 * Equalizer state and changes (preset, PEQ bands, master gain), read on
 * opening like the other sound settings and never polled. Each change goes
 * through the operation lease and is followed by a fresh read, so the dialog
 * always shows what the player reports after it.
 */
import { reactive, readonly } from 'vue'
import { readEq, selectPreset, setBands, setMaster, type EqOutcome, type EqState, type PeqBand } from '../gateway/eq'
import type { MessageKey } from '../i18n'
import { onSessionOpened } from './connection'
import { run, type OperationContext } from './operation'

interface EqModel {
  current: EqState | null
  feedback: MessageKey | null
  pending: boolean
}

const state = reactive<EqModel>({ current: null, feedback: null, pending: false })
export const eq = readonly(state)

onSessionOpened((session) => {
  state.current = null
  state.feedback = null
  session.onClose(() => {
    state.current = null
    state.feedback = null
  })
})

const FEEDBACK: Record<EqOutcome, MessageKey> = {
  confirmed: 'sound_confirmed',
  already: 'sound_confirmed',
  stale: 'sound_stale',
  'not-sent': 'sound_not_sent',
  uncertain: 'sound_uncertain',
  invalid: 'eq_invalid',
}

export async function readEqSettings(): Promise<void> {
  const result = await run('eq-read', async ({ session }) => readEq(session).catch(() => null))
  if (result === 'busy') {
    state.feedback = 'please_wait_for_the_current_request'
    return
  }
  state.current = result === 'no-session' ? null : result
  if (!state.current) state.feedback = 'eq_unavailable'
}

async function apply(steps: (context: OperationContext) => Promise<EqOutcome>): Promise<void> {
  state.pending = true
  state.feedback = 'sound_applying'
  try {
    const result = await run('eq', async (context) => {
      const outcome = await steps(context)
      const fresh = await readEq(context.session).catch(() => null)
      return { outcome, fresh }
    })
    if (result === 'busy') {
      state.feedback = 'please_wait_for_the_current_request'
      return
    }
    if (result === 'no-session') {
      state.feedback = 'sound_not_sent'
      return
    }
    state.current = result.fresh
    state.feedback = FEEDBACK[result.outcome]
  } finally {
    state.pending = false
  }
}

export function applyPreset(target: number): Promise<void> {
  const current = state.current
  if (!current) return Promise.resolve()
  return apply(async (context) => {
    await context.pace()
    return selectPreset(context, current.preset, target)
  })
}

/** Changed bands first, then the master gain (reference restore order); stops at the first unconfirmed step. */
export function applyBands(bands: readonly PeqBand[], master: number): Promise<void> {
  const current = state.current
  if (!current) return Promise.resolve()
  const changed = bands.filter((band) => {
    const before = current.bands.find((item) => item.position === band.position)
    return !before || before.frequency !== band.frequency || before.gain !== band.gain || before.q !== band.q
  })
  return apply(async (context) => {
    let outcome: EqOutcome = 'already'
    if (changed.length) {
      await context.pace()
      outcome = await setBands(context, current.preset, current.bands, changed)
      if (outcome !== 'confirmed' && outcome !== 'already') return outcome
    }
    if (master !== current.master) {
      await context.pace()
      outcome = await setMaster(context, current.preset, current.master, master)
    }
    return outcome
  })
}
