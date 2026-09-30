/** Browser-only preferences; they never change device settings. */
export type Appearance = 'system' | 'light' | 'dark'

/** Text size steps (owner, 2026-09-30; docs/typography.md). Standard is the default and sets no attribute. */
export const TEXT_SIZES = ['compact', 'standard', 'large', 'extra-large'] as const
export type TextSize = (typeof TEXT_SIZES)[number]
export const DEFAULT_TEXT_SIZE: TextSize = 'standard'

export function isTextSize(value: unknown): value is TextSize {
  return TEXT_SIZES.some((size) => size === value)
}

/** Body text of each step in px (src/styles/main.css), for the choice's sample. */
export const TEXT_SIZE_SAMPLE: Record<TextSize, number> = { compact: 13, standard: 14, large: 16, 'extra-large': 18 }
