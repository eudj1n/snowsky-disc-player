<script setup lang="ts">
/** The Card page's two views: what takes space, and the folders (round 16). */
import { t } from '../../i18n'

defineProps<{ current: 'space' | 'files' }>()
const TAB =
  'rounded-20 px-14 py-7 text-12 font-[550] text-muted hover:bg-hover hover:text-ink aria-[current=page]:bg-selected aria-[current=page]:text-ink'
</script>

<template>
  <nav :aria-label="t('card_tabs')" class="-mt-14 mb-24 flex gap-6">
    <RouterLink to="/card" :class="TAB" :aria-current="current === 'space' ? 'page' : undefined">{{
      t('space_tab')
    }}</RouterLink>
    <RouterLink to="/card/files" :class="TAB" :aria-current="current === 'files' ? 'page' : undefined">{{
      t('files_tab')
    }}</RouterLink>
  </nav>
</template>
