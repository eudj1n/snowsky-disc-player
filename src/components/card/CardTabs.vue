<script setup lang="ts">
/**
 * The Card page's views: what takes space, the folders (round 16), the trash (combined-008) and the library's
 * state with its enrichment (2026-10-02).
 */
import { computed } from 'vue'
import { t } from '../../i18n'
import PageTabs from '../common/PageTabs.vue'

const props = withDefaults(defineProps<{ current: 'space' | 'files' | 'trash' | 'state'; trash?: boolean }>(), {
  trash: false,
})
const tabs = computed(() => [
  { to: '/card', text: t('space_tab'), current: props.current === 'space' },
  { to: '/card/files', text: t('files_tab'), current: props.current === 'files' },
  ...(props.trash ? [{ to: '/card/trash', text: t('trash_tab'), current: props.current === 'trash' }] : []),
  { to: '/card/state', text: t('state_tab'), current: props.current === 'state' },
])
</script>

<template>
  <PageTabs :label="t('card_tabs')" :tabs="tabs" />
</template>
