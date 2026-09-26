<script setup lang="ts">
import { computed } from 'vue'
import PaletteOptions from '../components/appearance/PaletteOptions.vue'
import ThemeOptions from '../components/appearance/ThemeOptions.vue'
import { DARK_PALETTES, LIGHT_PALETTES, SWATCHES } from '../domain/palettes'
import { t } from '../i18n'
import {
  appearance,
  chooseAppearance,
  chooseDarkPalette,
  chooseLightPalette,
  darkPalette,
  lightPalette,
} from '../stores/appearance'
import { closeDialog, ui } from '../stores/ui'
import UiDialog from '../ui/UiDialog.vue'

const lightNames = computed(() => ({
  sage: t('palette_sage'),
  paper: t('palette_paper'),
  mist: t('palette_mist'),
  white: t('palette_white'),
}))
const darkNames = computed(() => ({
  charcoal: t('palette_charcoal'),
  olive: t('palette_olive'),
  graphite: t('palette_graphite'),
  espresso: t('palette_espresso'),
  black: t('palette_black'),
}))
</script>

<template>
  <UiDialog
    :open="ui.dialog === 'appearance'"
    :eyebrow="t('your_space')"
    :close-label="t('close')"
    @close="closeDialog"
  >
    <h2 class="my-[0.83em] text-24 font-bold tracking-[-0.8px]">{{ t('in_your_own_light') }}</h2>
    <p class="text-12 leading-[1.7] text-muted">{{ t('set_the_mood_for_your_music') }}</p>
    <ThemeOptions
      :value="appearance"
      :labels="{ light: t('light'), dark: t('dark'), system: t('system') }"
      :light="SWATCHES[lightPalette]"
      :dark="SWATCHES[darkPalette]"
      @choose="chooseAppearance"
    />
    <h3 class="mt-4 mb-10 text-12 font-semibold">{{ t('palette_light_label') }}</h3>
    <PaletteOptions
      :label="t('palette_light_label')"
      :options="LIGHT_PALETTES"
      :value="lightPalette"
      :names="lightNames"
      @choose="chooseLightPalette"
    />
    <h3 class="mt-18 mb-10 text-12 font-semibold">{{ t('palette_dark_label') }}</h3>
    <PaletteOptions
      :label="t('palette_dark_label')"
      :options="DARK_PALETTES"
      :value="darkPalette"
      :names="darkNames"
      @choose="chooseDarkPalette"
    />
    <p class="mt-23 text-11 leading-[1.7] text-muted">{{ t('saved_in_this_browser') }}</p>
  </UiDialog>
</template>
