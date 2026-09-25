<script setup lang="ts">
/**
 * Application shell after the reference layout: skip link, fixed sidebar,
 * scrolling workspace (top bar, view, footer), fixed player, dialogs, toast.
 */
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { t } from './i18n'
import AppearanceDialog from './layout/AppearanceDialog.vue'
import AppPlayerBar from './layout/AppPlayerBar.vue'
import AppSidebar from './layout/AppSidebar.vue'
import AppToast from './layout/AppToast.vue'
import AppTopbar from './layout/AppTopbar.vue'
import ConnectionDialog from './layout/ConnectionDialog.vue'
import ListeningPanel from './layout/ListeningPanel.vue'
import './stores/appearance'
import { probeGateway } from './stores/connection'
import { loadCollection, loadLibraryFacts } from './stores/library'
import { setQuery, ui } from './stores/ui'

const route = useRoute()
// A real navigation clears the search (reference hashchange handler).
watch(
  () => route.fullPath,
  () => setQuery(''),
)

function focusSearch(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
  if (document.querySelector('dialog[open]')) return
  event.preventDefault()
  document.getElementById('search')?.focus()
}

function skipToContent(event: MouseEvent): void {
  event.preventDefault()
  document.getElementById('main')?.focus()
}

onMounted(async () => {
  document.addEventListener('keydown', focusSearch)
  if (await probeGateway()) {
    await loadLibraryFacts()
    await loadCollection()
  }
})
onBeforeUnmount(() => document.removeEventListener('keydown', focusSearch))
</script>

<template>
  <a
    href="#main"
    class="fixed -top-100 left-10 z-100 bg-white p-10 text-[#242521] focus:top-10"
    @click="skipToContent"
    >{{ t('skip_to_content') }}</a
  >
  <AppSidebar />
  <div class="ml-(--sidebar) min-h-screen pb-(--player) listening:mr-380" :class="{ 'listening-open': ui.panel }">
    <AppTopbar />
    <main
      id="main"
      tabindex="-1"
      class="mx-auto max-w-1680 px-44 pt-34 pb-15 outline-none wide:px-60 wide:pt-40 wide:pb-20 compact:px-26 compact:pt-28 phone:px-18 phone:pt-23 phone:pb-10 listening:px-30"
    >
      <RouterView />
    </main>
    <footer
      class="flex justify-between gap-10 px-44 pt-35 pb-24 text-9 text-muted compact:px-26 compact:pt-30 phone:px-18 phone:pt-28 phone:pb-22 phone:text-8"
    >
      <span>{{ t('collected_by_you_played_your_way') }}</span>
      <span class="text-7 tracking-[1.6px] phone:text-6 phone:tracking-[1px]">DISC PLAYER · PREVIEW</span>
    </footer>
  </div>
  <AppPlayerBar />
  <ListeningPanel />
  <ConnectionDialog />
  <AppearanceDialog />
  <AppToast />
</template>
