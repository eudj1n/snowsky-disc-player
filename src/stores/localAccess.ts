/**
 * Chrome's local network permission for the hosted page (Local Network Access,
 * 2026-09-30): granted, still to be asked, denied, or a browser without it
 * (Safari, iOS, older Chrome), so the page can say why the player is silent.
 */
import { reactive, readonly } from 'vue'
import { hosted } from '../gateway/address'

export type LocalAccess = 'unknown' | 'granted' | 'prompt' | 'denied' | 'unsupported'

const state = reactive<{ access: LocalAccess }>({ access: 'unknown' })
export const localAccess = readonly(state)

export async function readLocalAccess(): Promise<void> {
  if (!hosted) return
  if (typeof navigator === 'undefined' || !('permissions' in navigator)) {
    state.access = 'unsupported'
    return
  }
  // The name since Chrome 145, then the one it shipped with in 142.
  for (const name of ['local-network', 'local-network-access']) {
    try {
      const status = await navigator.permissions.query({ name } as unknown as PermissionDescriptor)
      state.access = status.state
      status.onchange = () => {
        state.access = status.state
      }
      return
    } catch {
      // Unknown to this browser: try the other name.
    }
  }
  state.access = 'unsupported'
}
