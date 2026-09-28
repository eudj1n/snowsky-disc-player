<script setup lang="ts">
/** The Card page's views: what takes space, the folders (round 16) and the trash (combined-008). */
import { t } from '../../i18n'

withDefaults(defineProps<{ current: 'space' | 'files' | 'trash'; trash?: boolean }>(), { trash: false })
const TAB =
  'rounded-20 px-14 py-7 text-12 font-[550] text-muted hover:bg-hover hover:text-ink aria-[current=page]:bg-selected aria-[current=page]:text-ink'
</script>

<template>
  <nav :aria-label="t('card_tabs')" class="flex gap-6 rounded-24 bg-soft p-4">
    <RouterLink to="/card" :class="TAB" :aria-current="current === 'space' ? 'page' : undefined">{{
      t('space_tab')
    }}</RouterLink>
    <RouterLink to="/card/files" :class="TAB" :aria-current="current === 'files' ? 'page' : undefined">{{
      t('files_tab')
    }}</RouterLink>
    <RouterLink v-if="trash" to="/card/trash" :class="TAB" :aria-current="current === 'trash' ? 'page' : undefined">{{
      t('trash_tab')
    }}</RouterLink>
  </nav>
</template>
