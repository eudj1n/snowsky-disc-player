<script setup lang="ts">
/**
 * Settings (owner, 2026-10-01): a page of its own under Your player, reached
 * from the sidebar, the top bar's gear and the palette. Its parts are tabs,
 * as the Card section's views (owner, 2026-10-02: more settings will come):
 * the appearance of this browser, and the outside sources the page may ask,
 * kept on the player. `?part=` names the tab, so links lead to it. Pairing
 * stays in the connection dialog, the first step of using the page.
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import PageTabs from '../components/common/PageTabs.vue'
import ViewHeading from '../components/common/ViewHeading.vue'
import { t, type MessageKey } from '../i18n'
import AppearanceSettings from './AppearanceSettings.vue'
import ExternalSourcesSettings from './ExternalSourcesSettings.vue'

interface Part {
  id: 'appearance' | 'sources'
  title: MessageKey
  note: MessageKey
}
const PARTS: readonly Part[] = [
  { id: 'appearance', title: 'appearance', note: 'saved_in_this_browser' },
  { id: 'sources', title: 'external_sources', note: 'sources_note' },
]

const route = useRoute()
const part = computed<Part>(() => PARTS.find((item) => item.id === route.query.part) ?? (PARTS[0] as Part))
const tabs = computed(() =>
  PARTS.map((item) => ({
    to: { path: '/settings', query: item === PARTS[0] ? {} : { part: item.id } },
    text: t(item.title),
    current: item.id === part.value.id,
  })),
)
</script>

<template>
  <ViewHeading :eyebrow="t('your_player')" :title="t('settings')">
    <div class="self-end"><PageTabs :label="t('settings_parts')" :tabs="tabs" /></div>
  </ViewHeading>
  <section :aria-label="t(part.title)">
    <p class="mt-0 mb-20 max-w-720 text-footnote leading-[1.55] text-muted">{{ t(part.note) }}</p>
    <AppearanceSettings v-if="part.id === 'appearance'" />
    <ExternalSourcesSettings v-else />
  </section>
</template>
