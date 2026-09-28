/**
 * The service's diagnostics (combined-008, /api/about), read when the
 * connection dialog shows them. Older images have none.
 */
import { reactive, readonly } from 'vue'
import { parseAbout, type About } from '../domain/about'
import { connection, http } from './connection'

const state = reactive({ about: null as About | null, loading: false })
export const about = readonly(state)

export async function loadAbout(): Promise<void> {
  if (connection.gateway === false) return
  state.loading = true
  try {
    state.about = parseAbout(await http.serviceRead('/api/about'))
  } catch {
    // Unreachable for now: the last document stays.
  } finally {
    state.loading = false
  }
}
