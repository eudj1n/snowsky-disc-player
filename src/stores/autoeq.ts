/**
 * Headphone corrections from AutoEq on the player's equalizer (owner,
 * 2026-10-20; docs/autoeq.md). Everything happens on a click: the index is
 * read when the listener starts a search, a model's correction when it is
 * chosen, and the player's user preset is written when asked, through the
 * equalizer store (the preset selected, ten bands in one message, then the
 * master level, each confirmed by reading back). Which headphones a preset
 * holds is kept on the player (the store's `eq_slots` collection) once the
 * player confirmed its bands, so every browser shows it; without the
 * collection (an older card release) nothing is kept and nothing is said.
 */
import { reactive, readonly, watch } from 'vue'
import {
  AUTOEQ_REVISION,
  fitsPlayer,
  type Correction,
  type HeadphoneForm,
  type HeadphoneResult,
} from '../domain/autoeq'
import { fetchCorrection, fetchRecommended } from '../gateway/autoeq'
import { putRecord } from '../gateway/store'
import { readCollectionSnapshot } from './storeSnapshot'
import { connection, http, originAllowed } from './connection'
import { applyPresetBands } from './eq'
import { sourceAllowed } from './externalSources'
import { pairingToken } from './pairing'
import { toast } from './ui'

/** What a user preset holds, as the store keeps it. */
export interface SlotRecord {
  slot: number
  headphone: string
  source?: string
  rig?: string
  form?: HeadphoneForm
  origin?: string
  revision?: string
  result?: string
  at: number
}

export type LoadState = 'idle' | 'loading' | 'ready' | 'failed'

interface AutoEqModel {
  headphones: HeadphoneResult[]
  index: LoadState
  chosen: HeadphoneResult | null
  correction: Correction | null
  /** `unfit`: the result read, but outside the player's bounds. */
  lookup: LoadState | 'unfit'
  /** By preset number 1..10. */
  slots: Partial<Record<number, SlotRecord>>
  /** The card release declares the collection. */
  slotsAvailable: boolean
  writing: boolean
}

const state = reactive<AutoEqModel>({
  headphones: [],
  index: 'idle',
  chosen: null,
  correction: null,
  lookup: 'idle',
  slots: {},
  slotsAvailable: false,
  writing: false,
})
export const autoeq = readonly(state)

/** The release's origins admit jsDelivr. */
export const autoeqAdmitted = (): boolean => originAllowed('jsdelivr')
/** AutoEq may be asked: the origins admit it and the owner allowed the source. */
export const autoeqAllowed = (): boolean => autoeqAdmitted() && sourceAllowed('autoeq')

/** The user preset's wire value (160..169) for its number 1..10. */
export const presetWire = (slot: number): number => 159 + slot

export async function loadHeadphones(): Promise<void> {
  if (!autoeqAllowed() || state.index === 'loading' || state.index === 'ready') return
  state.headphones = []
  state.index = 'loading'
  try {
    state.headphones = await fetchRecommended()
    state.index = 'ready'
  } catch {
    state.headphones = []
    state.index = 'failed'
  }
}

/** Reads the model's correction; a later choice wins over an earlier one still loading. */
export async function chooseHeadphone(result: HeadphoneResult): Promise<void> {
  if (!autoeqAllowed()) return
  state.chosen = result
  state.correction = null
  state.lookup = 'loading'
  try {
    const correction = await fetchCorrection(result)
    if (state.chosen !== result) return
    state.correction = correction
    state.lookup = fitsPlayer(correction) ? 'ready' : 'unfit'
  } catch {
    if (state.chosen !== result) return
    state.lookup = 'failed'
  }
}

export function clearHeadphone(): void {
  state.chosen = null
  state.correction = null
  state.lookup = 'idle'
}

export async function loadEqSlots(): Promise<void> {
  if (!connection.store) return
  try {
    const records = await readCollectionSnapshot<SlotRecord>(http, 'eq_slots')
    state.slotsAvailable = records !== null
    const slots: AutoEqModel['slots'] = {}
    for (const { value } of records ?? [])
      if (Number.isInteger(value.slot) && value.slot >= 1 && value.slot <= 10 && typeof value.headphone === 'string')
        slots[value.slot] = value
    state.slots = slots
  } catch {
    // Unreachable for now: what was read last stays.
  }
}
// The slots are read when the Sound dialog opens (owner, 2026-10-23: not at every page load), forgotten on
// disconnect.
watch(
  () => connection.store,
  (store) => {
    if (!store) {
      state.slots = {}
      state.slotsAvailable = false
    }
  },
  { immediate: true },
)

/** Keeps on the player what the preset now holds; a lost reply is said and not retried. */
async function rememberSlot(slot: number, result: HeadphoneResult): Promise<void> {
  if (!state.slotsAvailable) return
  const token = pairingToken()
  if (!token) return
  const record: SlotRecord = {
    slot,
    headphone: result.name,
    source: result.source,
    ...(result.rig ? { rig: result.rig } : {}),
    form: result.form,
    origin: 'autoeq',
    revision: AUTOEQ_REVISION,
    result: result.path,
    at: Math.floor(Date.now() / 1000),
  }
  try {
    const outcome = await putRecord(http, 'eq_slots', { ...record }, token)
    if (outcome !== 'confirmed') toast('result_unconfirmed_the_command_was_not_retried', true)
  } catch {
    toast('result_unconfirmed_the_command_was_not_retried', true)
  } finally {
    await loadEqSlots()
  }
}

/** Writes the chosen correction to the user preset `slot` (1..10); the equalizer store reports the outcome. */
export async function writeCorrection(slot: number): Promise<void> {
  const chosen = state.chosen
  const correction = state.correction
  if (!chosen || !correction || state.lookup !== 'ready' || state.writing || !autoeqAllowed()) return
  state.writing = true
  try {
    const outcome = await applyPresetBands(presetWire(slot), correction.bands, correction.preamp)
    if (outcome === 'confirmed' || outcome === 'already') await rememberSlot(slot, chosen)
  } finally {
    state.writing = false
  }
}
