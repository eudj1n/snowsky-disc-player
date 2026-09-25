/**
 * Sound settings (reference sound.mjs): values are read on opening or on
 * request, never polled; each change is checked against the value the user
 * saw and confirmed by a fresh read. Any outcome other than confirmed drops
 * the values so the user reads them again before editing.
 */
import { reactive, readonly } from 'vue'
import { changeSound, readSound, type SoundName, type SoundValues } from '../gateway/sound'
import type { MessageKey } from '../i18n'
import { onSessionOpened } from './connection'
import { run } from './operation'

interface SoundModel {
  values: SoundValues | null
  feedback: MessageKey | null
  pending: SoundName | null
}

const state = reactive<SoundModel>({ values: null, feedback: null, pending: null })
export const sound = readonly(state)

onSessionOpened((session) => {
  state.values = null
  state.feedback = null
  session.onClose(() => {
    state.values = null
    state.feedback = null
  })
})

export async function readSoundSettings(): Promise<void> {
  state.feedback = 'sound_loading'
  const result = await run('sound-read', async ({ session }) => readSound(session).catch(() => null))
  if (result === 'busy') {
    state.feedback = 'please_wait_for_the_current_request'
    return
  }
  state.values = result === 'no-session' ? null : result
  state.feedback = state.values ? 'sound_ready' : 'sound_unavailable'
}

export async function applySound(name: SoundName, value: number): Promise<void> {
  const values = state.values
  if (!values) return
  state.pending = name
  state.feedback = 'sound_applying'
  try {
    const result = await run('sound', async (context) => {
      await context.pace()
      return changeSound(context, name, value, values[name])
    })
    if (result === 'busy') {
      state.feedback = 'please_wait_for_the_current_request'
      return
    }
    if (
      result !== 'no-session' &&
      (result.status === 'confirmed' || result.status === 'already') &&
      result.value === value
    ) {
      state.values = { ...values, [name]: value }
      state.feedback = 'sound_confirmed'
      return
    }
    state.values = null
    state.feedback =
      result === 'no-session'
        ? 'sound_not_sent'
        : result.status === 'stale'
          ? 'sound_stale'
          : result.status === 'not-sent'
            ? 'sound_not_sent'
            : 'sound_uncertain'
  } finally {
    state.pending = null
  }
}

export function markSoundDraft(): void {
  state.feedback = 'sound_draft'
}
