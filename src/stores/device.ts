/**
 * Live device facts (next image): read when the player dialog opens and a
 * moment after the playing track changes (stock opens its output stream when
 * playback starts). Older images have no such route and keep them unknown.
 */
import { reactive, readonly, watch } from 'vue'
import { parseDeviceFacts, type DeviceFacts } from '../domain/device'
import { connection, http } from './connection'
import { playback } from './playback'

const state = reactive({ facts: null as DeviceFacts | null })
export const device = readonly(state)

export async function refreshDevice(): Promise<void> {
  if (connection.gateway === false) return
  try {
    const value = await http.device()
    state.facts = value === null ? null : parseDeviceFacts(value)
  } catch {
    // Unreachable for now: the last facts stay.
  }
}

let timer: ReturnType<typeof setTimeout> | null = null
watch(
  () => [playback.current.track?.path, playback.current.state] as const,
  () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void refreshDevice(), 2500)
  },
)
