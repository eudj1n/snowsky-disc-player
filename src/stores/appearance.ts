/**
 * Light, dark or system appearance: a browser preference, never a device
 * setting. As in the reference theme.js, the document always carries a
 * concrete data-theme and System follows the operating system live.
 * public/theme.js applies the saved choice before the stylesheet paints.
 */
import { ref, watchEffect } from 'vue'
import { readPreference, writePreference } from '../lib/storage'

import type { Appearance } from '../domain/preferences'

export type { Appearance }
export const APPEARANCE_KEY = 'disc-player.appearance'
const saved = readPreference(APPEARANCE_KEY)

export const appearance = ref<Appearance>(saved === 'light' || saved === 'dark' ? saved : 'system')
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
const systemDark = ref(media?.matches ?? false)
media?.addEventListener('change', (event) => (systemDark.value = event.matches))

watchEffect(() => {
  if (typeof document === 'undefined') return
  const dark = appearance.value === 'dark' || (appearance.value === 'system' && systemDark.value)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#151815' : '#faf9f6')
})

export function chooseAppearance(value: Appearance): void {
  appearance.value = value
  writePreference(APPEARANCE_KEY, value)
}
