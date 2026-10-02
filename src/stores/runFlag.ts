/**
 * Whether a library enrichment run is going or waits for the owner (the Card
 * item's dot), apart from the run's own module so the sidebar does not load
 * it.
 */
import { reactive, readonly } from 'vue'

const state = reactive({ active: false })
export const runFlag = readonly(state)
export function setRunActive(active: boolean): void {
  state.active = active
}
