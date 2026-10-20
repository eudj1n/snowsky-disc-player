/**
 * Equalizer state and changes (preset, PEQ bands, master gain), read on
 * opening like the other sound settings and never polled. Each change goes
 * through the operation lease and is followed by a fresh read, so the dialog
 * always shows what the player reports after it.
 */
import { reactive, readonly } from 'vue'
import {
  isUserPreset,
  readEq,
  selectPreset,
  setBands,
  setMaster,
  type EqOutcome,
  type EqState,
  type PeqBand,
} from '../gateway/eq'
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

/** Runs the steps under the lease and reads the equalizer fresh after them; the outcome, or null when nothing ran. */
async function apply(steps: (context: OperationContext) => Promise<EqOutcome>): Promise<EqOutcome | null> {
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
      return null
    }
    if (result === 'no-session') {
      state.feedback = 'sound_not_sent'
      return null
    }
    state.current = result.fresh
    state.feedback = FEEDBACK[result.outcome]
    return result.outcome
  } finally {
    state.pending = false
  }
}

export async function applyPreset(target: number): Promise<void> {
  const current = state.current
  if (!current) return
  await apply(async (context) => {
    await context.pace()
    return selectPreset(context, current.preset, target)
  })
}

const differing = (before: readonly PeqBand[], bands: readonly PeqBand[]) =>
  bands.filter((band) => {
    const item = before.find((other) => other.position === band.position)
    return !item || item.frequency !== band.frequency || item.gain !== band.gain || item.q !== band.q
  })

/** Changed bands first, then the master gain (reference restore order); stops at the first unconfirmed step. */
async function writeBands(
  context: OperationContext,
  shown: EqState,
  bands: readonly PeqBand[],
  master: number,
): Promise<EqOutcome> {
  let outcome: EqOutcome = 'already'
  const changed = differing(shown.bands, bands)
  if (changed.length) {
    await context.pace()
    outcome = await setBands(context, shown.preset, shown.bands, changed)
    if (outcome !== 'confirmed' && outcome !== 'already') return outcome
  }
  if (master !== shown.master) {
    await context.pace()
    outcome = await setMaster(context, shown.preset, shown.master, master)
  }
  return outcome
}

export async function applyBands(bands: readonly PeqBand[], master: number): Promise<void> {
  const current = state.current
  if (!current) return
  await apply((context) => writeBands(context, current, bands, master))
}

/**
 * A whole preset at once (AutoEq, owner 2026-10-20): the user preset is
 * selected first when another is shown, its own bands and master are read,
 * then the ten bands go in one message and the master after them, each
 * confirmed by reading back. Confirmed also when the preset already held them.
 */
export async function applyPresetBands(
  preset: number,
  bands: readonly PeqBand[],
  master: number,
): Promise<EqOutcome | null> {
  const current = state.current
  if (!current || !isUserPreset(preset)) return null
  return apply(async (context) => {
    let shown = current
    if (current.preset !== preset) {
      await context.pace()
      const selected = await selectPreset(context, current.preset, preset)
      if (selected !== 'confirmed') return selected
      const read = await readEq(context.session).catch(() => null)
      if (!read || read.preset !== preset) return 'uncertain'
      shown = read
    }
    return writeBands(context, shown, bands, master)
  })
}
