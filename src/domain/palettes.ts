/**
 * Theme palettes (docs/themes.md). The defaults live in styles/main.css, the
 * alternatives in styles/palettes.css under data-light-palette and
 * data-dark-palette. Swatches here only draw the appearance dialog's previews:
 * sidebar surface, page paper and the primary button.
 */
export const LIGHT_PALETTES = ['sage', 'paper', 'mist', 'white'] as const
export const DARK_PALETTES = ['charcoal', 'olive', 'graphite', 'espresso', 'black'] as const
export type LightPalette = (typeof LIGHT_PALETTES)[number]
export type DarkPalette = (typeof DARK_PALETTES)[number]
export const DEFAULT_LIGHT: LightPalette = 'sage'
export const DEFAULT_DARK: DarkPalette = 'charcoal'

export interface Swatch {
  surface: string
  paper: string
  strong: string
}

export const SWATCHES: Record<LightPalette | DarkPalette, Swatch> = {
  sage: { surface: '#f2f1ec', paper: '#faf9f6', strong: '#30362b' },
  paper: { surface: '#f3efe8', paper: '#faf7f2', strong: '#3a322a' },
  mist: { surface: '#eff1f3', paper: '#f7f8f9', strong: '#2b3137' },
  white: { surface: '#f5f5f5', paper: '#ffffff', strong: '#1f1f1f' },
  charcoal: { surface: '#121110', paper: '#262320', strong: '#e9e2d9' },
  olive: { surface: '#101410', paper: '#22291f', strong: '#d8e1cc' },
  graphite: { surface: '#111213', paper: '#232527', strong: '#e2e5e8' },
  espresso: { surface: '#110e0b', paper: '#251f19', strong: '#ead9c5' },
  black: { surface: '#000000', paper: '#151515', strong: '#f3f3f3' },
}

export const isLightPalette = (value: unknown): value is LightPalette =>
  (LIGHT_PALETTES as readonly unknown[]).includes(value)
export const isDarkPalette = (value: unknown): value is DarkPalette =>
  (DARK_PALETTES as readonly unknown[]).includes(value)
