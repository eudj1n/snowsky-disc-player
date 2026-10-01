<script setup lang="ts">
/**
 * The Settings page's appearance (owner, 2026-09-30/10-01: from the dialog to
 * the page): theme and its tone, text size and the interface language, kept
 * in this browser. The player's own language is set on the player.
 */
import { computed } from 'vue'
import LanguageOptions from '../components/appearance/LanguageOptions.vue'
import PaletteOptions from '../components/appearance/PaletteOptions.vue'
import TextSizeOptions from '../components/appearance/TextSizeOptions.vue'
import ThemeOptions from '../components/appearance/ThemeOptions.vue'
import { DARK_PALETTES, LIGHT_PALETTES, SWATCHES } from '../domain/palettes'
import { chooseLocale, locale, LOCALES, t, type Locale } from '../i18n'
import {
  appearance,
  chooseAppearance,
  chooseDarkPalette,
  chooseLightPalette,
  chooseTextSize,
  darkActive,
  darkPalette,
  lightPalette,
  textSize,
} from '../stores/appearance'

const lightNames = computed(() => ({
  sage: t('palette_sage'),
  paper: t('palette_paper'),
  mist: t('palette_mist'),
  white: t('palette_white'),
}))
const sizeNames = computed(() => ({
  compact: t('text_size_compact'),
  standard: t('text_size_standard'),
  large: t('text_size_large'),
  'extra-large': t('text_size_extra_large'),
}))
/** Each language by its own name. */
const LANGUAGES = [
  { value: 'en', name: 'English' },
  { value: 'ru', name: 'Русский' },
] as const satisfies readonly { value: Locale; name: string }[]
const chooseLanguage = (value: string) => {
  if (value in LOCALES) chooseLocale(value as Locale)
}
const darkNames = computed(() => ({
  charcoal: t('palette_charcoal'),
  olive: t('palette_olive'),
  graphite: t('palette_graphite'),
  espresso: t('palette_espresso'),
}))
</script>

<template>
  <div class="grid max-w-560 gap-0" data-testid="settings-appearance">
    <ThemeOptions
      :value="appearance"
      :labels="{ light: t('light'), dark: t('dark'), system: t('system') }"
      :light="SWATCHES[lightPalette]"
      :dark="SWATCHES[darkPalette]"
      @choose="chooseAppearance"
    />
    <!-- Tones of the theme in effect only (owner, round 10). -->
    <template v-if="darkActive">
      <h3 class="mt-4 mb-10 text-body font-semibold">{{ t('palette_tone_dark') }}</h3>
      <PaletteOptions
        :label="t('palette_tone_dark')"
        :options="DARK_PALETTES"
        :value="darkPalette"
        :names="darkNames"
        @choose="chooseDarkPalette"
      />
    </template>
    <template v-else>
      <h3 class="mt-4 mb-10 text-body font-semibold">{{ t('palette_tone_light') }}</h3>
      <PaletteOptions
        :label="t('palette_tone_light')"
        :options="LIGHT_PALETTES"
        :value="lightPalette"
        :names="lightNames"
        @choose="chooseLightPalette"
      />
    </template>
    <h3 class="mt-22 mb-10 text-body font-semibold">{{ t('text_size') }}</h3>
    <TextSizeOptions :label="t('text_size')" :value="textSize" :names="sizeNames" @choose="chooseTextSize" />
    <h3 class="mt-22 mb-10 text-body font-semibold">{{ t('language') }}</h3>
    <LanguageOptions :label="t('language')" :value="locale" :options="LANGUAGES" @choose="chooseLanguage" />
  </div>
</template>
