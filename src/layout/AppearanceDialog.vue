<script setup lang="ts">
import ThemeOptions from '../components/appearance/ThemeOptions.vue'
import { t } from '../i18n'
import { appearance, chooseAppearance } from '../stores/appearance'
import { closeDialog, ui } from '../stores/ui'
import UiDialog from '../ui/UiDialog.vue'
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
      @choose="chooseAppearance"
    />
    <p class="mt-23 text-11 leading-[1.7] text-muted">{{ t('saved_in_this_browser') }}</p>
  </UiDialog>
</template>
