/**
 * The colours of a placeholder (owner, 2026-09-29: the page's own), as custom
 * properties for SleeveRecord and the tinted surfaces around it: the label,
 * its text, and a tint of it over the theme's surface with text in it.
 */
import { sleeve, SLEEVE_INK, SLEEVE_TONES } from '../../domain/artwork'

export function sleeveColours(title: string | null): Record<string, string> {
  const palette = sleeve(title).palette
  const label = SLEEVE_TONES[palette] ?? SLEEVE_TONES[0]
  const ink = SLEEVE_INK[palette] ?? '#fff'
  // Text in a light colour (sand, moss) takes more of the theme's ink to stay readable on its tint.
  const share = ink === '#fff' ? 78 : 45
  return {
    '--label': label,
    '--label-ink': ink,
    '--tint': `color-mix(in srgb, ${label} 22%, var(--soft))`,
    '--tint-ink': `color-mix(in srgb, ${label} ${String(share)}%, var(--ink))`,
  }
}
