<script setup lang="ts">
/**
 * Settings (owner, 2026-10-01): a page of its own under Your player, reached
 * from the sidebar, the top bar's gear and the palette. One page with
 * anchors (owner: the sources will keep growing, and a long page suits
 * phones better than tabs): the appearance of this browser and the outside
 * sources the page may ask, kept on the player. Pairing stays in the
 * connection dialog, the first step of using the page.
 */
import { computed } from 'vue'
import SectionHeading from '../components/common/SectionHeading.vue'
import ViewHeading from '../components/common/ViewHeading.vue'
import { t, type MessageKey } from '../i18n'
import AppearanceSettings from './AppearanceSettings.vue'
import ExternalSourcesSettings from './ExternalSourcesSettings.vue'

interface Part {
  id: string
  title: MessageKey
  note: MessageKey
}
const PARTS: readonly Part[] = [
  { id: 'appearance', title: 'appearance', note: 'saved_in_this_browser' },
  { id: 'sources', title: 'external_sources', note: 'sources_note' },
]

const parts = computed(() => PARTS)
/** Scrolls to a part; `?part=` opens the page there (the router's scrollBehavior; the hash is the router's). */
function show(id: string): void {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById(`settings-${id}`)?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
}
</script>

<template>
  <ViewHeading :eyebrow="t('your_player')" :title="t('settings')">
    <nav v-if="parts.length > 1" :aria-label="t('settings')" class="flex flex-wrap gap-8 self-end">
      <button
        v-for="part in parts"
        :key="part.id"
        type="button"
        class="rounded-20 border border-line px-14 py-7 text-footnote text-secondary hover:bg-hover hover:text-ink"
        @click="show(part.id)"
      >
        {{ t(part.title) }}
      </button>
    </nav>
  </ViewHeading>
  <section
    v-for="part in parts"
    :id="`settings-${part.id}`"
    :key="part.id"
    class="scroll-mt-24 pb-44"
    :aria-labelledby="`settings-${part.id}-title`"
  >
    <SectionHeading :id="`settings-${part.id}-title`" :title="t(part.title)" :subtitle="t(part.note)" class="mt-0!" />
    <AppearanceSettings v-if="part.id === 'appearance'" />
    <ExternalSourcesSettings v-else-if="part.id === 'sources'" />
  </section>
</template>
