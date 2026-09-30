/**
 * Light, dark or system appearance: a browser preference, never a device
 * setting. As in the reference theme.js, the document always carries a
 * concrete data-theme and System follows the operating system live.
 * public/theme.js applies the saved choice before the stylesheet paints.
 */
import { computed, ref, watchEffect } from 'vue'
import { readPreference, writePreference } from '../lib/storage'
import {
  DEFAULT_DARK,
  DEFAULT_LIGHT,
  isDarkPalette,
  isLightPalette,
  type DarkPalette,
  type LightPalette,
} from '../domain/palettes'

import { DEFAULT_TEXT_SIZE, isTextSize, type Appearance, type TextSize } from '../domain/preferences'

export type { Appearance }
export const APPEARANCE_KEY = 'disc-player.appearance'
const saved = readPreference(APPEARANCE_KEY)

export const appearance = ref<Appearance>(saved === 'light' || saved === 'dark' ? saved : 'system')
/** The palette each theme uses (owner, round 10); public/theme.js applies them before paint too. */
export const LIGHT_PALETTE_KEY = 'disc-player.light-palette'
export const DARK_PALETTE_KEY = 'disc-player.dark-palette'
const savedLight = readPreference(LIGHT_PALETTE_KEY)
const savedDark = readPreference(DARK_PALETTE_KEY)
export const lightPalette = ref<LightPalette>(isLightPalette(savedLight) ? savedLight : DEFAULT_LIGHT)
export const darkPalette = ref<DarkPalette>(isDarkPalette(savedDark) ? savedDark : DEFAULT_DARK)
/** The text size (owner, 2026-09-30); public/theme.js applies it before paint too. */
export const TEXT_SIZE_KEY = 'disc-player.text-size'
const savedSize = readPreference(TEXT_SIZE_KEY)
export const textSize = ref<TextSize>(isTextSize(savedSize) ? savedSize : DEFAULT_TEXT_SIZE)
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
const systemDark = ref(media?.matches ?? false)
media?.addEventListener('change', (event) => (systemDark.value = event.matches))

/** The theme in effect: the choice, or the system's for System. */
export const darkActive = computed(
  () => appearance.value === 'dark' || (appearance.value === 'system' && systemDark.value),
)

watchEffect(() => {
  if (typeof document === 'undefined') return
  const dark = darkActive.value
  const root = document.documentElement
  root.dataset.theme = dark ? 'dark' : 'light'
  if (lightPalette.value === DEFAULT_LIGHT) delete root.dataset.lightPalette
  else root.dataset.lightPalette = lightPalette.value
  if (darkPalette.value === DEFAULT_DARK) delete root.dataset.darkPalette
  else root.dataset.darkPalette = darkPalette.value
  // The browser chrome follows the page background of the active palette.
  const paper = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', paper || (dark ? '#181614' : '#faf9f6'))
})

watchEffect(() => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (textSize.value === DEFAULT_TEXT_SIZE) delete root.dataset.textSize
  else root.dataset.textSize = textSize.value
})

export function chooseAppearance(value: Appearance): void {
  appearance.value = value
  writePreference(APPEARANCE_KEY, value)
}

export function chooseLightPalette(value: LightPalette): void {
  lightPalette.value = value
  writePreference(LIGHT_PALETTE_KEY, value === DEFAULT_LIGHT ? null : value)
}

export function chooseDarkPalette(value: DarkPalette): void {
  darkPalette.value = value
  writePreference(DARK_PALETTE_KEY, value === DEFAULT_DARK ? null : value)
}

export function chooseTextSize(value: TextSize): void {
  textSize.value = value
  writePreference(TEXT_SIZE_KEY, value === DEFAULT_TEXT_SIZE ? null : value)
}
