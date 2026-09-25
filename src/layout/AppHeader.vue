<script setup lang="ts">
import { computed } from 'vue'
import { chooseLocale, locale, t, type Locale } from '../i18n'
import { appearance, chooseAppearance, type Appearance } from '../stores/appearance'
import UiSelect from '../ui/UiSelect.vue'

const language = computed<Locale>({ get: () => locale.value, set: chooseLocale })
const theme = computed<Appearance>({ get: () => appearance.value, set: chooseAppearance })
const languages = [
  { value: 'en', text: 'EN' },
  { value: 'ru', text: 'RU' },
] as const
const themes = computed(() => [
  { value: 'system' as const, text: t('appearance_system') },
  { value: 'light' as const, text: t('appearance_light') },
  { value: 'dark' as const, text: t('appearance_dark') },
])
</script>

<template>
  <header class="flex items-center gap-4 border-b border-line px-4 py-3 sm:px-6">
    <span class="inline-flex items-center gap-2 text-xl font-bold text-forest">
      <span
        aria-hidden="true"
        class="size-5 rounded-full bg-[radial-gradient(circle,var(--color-paper)_18%,var(--color-coral)_20%_28%,var(--color-forest)_30%)]"
      />
      disc<span class="text-coral">.</span>
    </span>
    <span class="hidden text-xs tracking-[0.12em] text-muted uppercase sm:inline">{{ t('tagline') }}</span>
    <div class="ml-auto flex gap-2">
      <UiSelect v-model="theme" :label="t('appearance')" :options="themes" />
      <UiSelect v-model="language" :label="t('language')" :options="languages" />
    </div>
  </header>
</template>
