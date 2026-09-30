<script setup lang="ts">
/**
 * Settings of this browser (owner, 2026-09-30): theme and its tone, text size
 * and the interface language, which left the top bar. The player's own
 * language is set on the player.
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
import { closeDialog, ui } from '../stores/ui'
import UiDialog from '../ui/UiDialog.vue'

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
  <UiDialog :open="ui.dialog === 'settings'" :eyebrow="t('settings')" :close-label="t('close')" @close="closeDialog">
    <h2 class="my-[0.83em] text-title2 font-bold tracking-heading">{{ t('in_your_own_light') }}</h2>
    <p class="text-footnote leading-[1.55] text-muted">{{ t('set_the_mood_for_your_music') }}</p>
    <ThemeOptions
      :value="appearance"
      :labels="{ light: t('light'), dark: t('dark'), system: t('system') }"
      :light="SWATCHES[lightPalette]"
      :dark="SWATCHES[darkPalette]"
      @choose="chooseAppearance"
    />
    <!-- Tones of the theme in effect only (owner, round 10): a shorter dialog. -->
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
    <p class="mt-23 text-footnote leading-[1.55] text-muted">{{ t('saved_in_this_browser') }}</p>
  </UiDialog>
</template>
