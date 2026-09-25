/** Light, dark or system appearance: a browser preference, never a device setting. */
import { ref, watchEffect } from 'vue'
import { readPreference, writePreference } from '../lib/storage'

export type Appearance = 'system' | 'light' | 'dark'
const KEY = 'disc-player.appearance'
const saved = readPreference(KEY)

export const appearance = ref<Appearance>(saved === 'light' || saved === 'dark' ? saved : 'system')

watchEffect(() => {
  const root = document.documentElement
  if (appearance.value === 'system') delete root.dataset.theme
  else root.dataset.theme = appearance.value
})

export function chooseAppearance(value: Appearance): void {
  appearance.value = value
  writePreference(KEY, value === 'system' ? null : value)
}
