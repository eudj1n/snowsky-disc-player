<script setup lang="ts">
/**
 * Application shell after the reference layout: skip link, fixed sidebar,
 * scrolling workspace (top bar, view), fixed player (only while a track is
 * observed), listening panel, dialogs, toast.
 */
import { computed, onBeforeUnmount, onMounted, watch, watchEffect } from 'vue'
import { t } from './i18n'
import AppearanceDialog from './layout/AppearanceDialog.vue'
import AppPlayerBar from './layout/AppPlayerBar.vue'
import AppSidebar from './layout/AppSidebar.vue'
import SidebarToggle from './layout/SidebarToggle.vue'
import AppToast from './layout/AppToast.vue'
import AppTopbar from './layout/AppTopbar.vue'
import ConnectionDialog from './layout/ConnectionDialog.vue'
import ImportDialog from './layout/ImportDialog.vue'
import KaraokeMode from './layout/KaraokeMode.vue'
import VisualizerMode from './layout/VisualizerMode.vue'
import CoverViewer from './layout/CoverViewer.vue'
import PlaylistDialog from './layout/PlaylistDialog.vue'
import ListeningPanel from './layout/ListeningPanel.vue'
import SearchPalette from './layout/SearchPalette.vue'
import SoundDialog from './layout/SoundDialog.vue'
import TrackMenuDialog from './layout/TrackMenuDialog.vue'
import './stores/appearance'
// combined-008: disliked tracks (and their skip rule) and pins follow the store once health reports it.
import './stores/disliked'
import './stores/pins'
import { connection, probeGateway, resumeAfterReload } from './stores/connection'
import { loadEnrichment } from './stores/enrichment'
import { loadArtistPictures } from './stores/artistPictures'
import { loadCollection, loadLibraryFacts, loadSavedCollection } from './stores/library'
import { output } from './stores/output'
import { playerVisible } from './stores/playback'
import { ui } from './stores/ui'
import { handleShortcut } from './views/shortcuts'
import { readLocalAccess } from './stores/localAccess'

/** The bar shows while the player has a track, and always on this browser's side: it holds the switch back. */
const barVisible = computed(() => playerVisible.value || output.side === 'browser')
// A player that becomes unreachable keeps the shown collection as a saved copy.
watch(
  () => connection.gateway,
  (reachable) => {
    if (reachable === false) void loadSavedCollection()
  },
)

function skipToContent(event: MouseEvent): void {
  event.preventDefault()
  document.getElementById('main')?.focus()
}

onMounted(async () => {
  document.addEventListener('keydown', handleShortcut)
  void readLocalAccess()
  void loadEnrichment()
  void loadArtistPictures()
  if (await probeGateway()) {
    // A tab that was connected before its reload takes control back (reads only).
    void resumeAfterReload()
    await loadLibraryFacts()
    await loadCollection()
  } else {
    // The player is unreachable: browse the saved copy, labelled with its date.
    await loadSavedCollection()
  }
})
onBeforeUnmount(() => document.removeEventListener('keydown', handleShortcut))
// The player's height drives the layout through --player (styles/main.css).
watchEffect(() => {
  document.documentElement.dataset.player = barVisible.value ? 'shown' : 'hidden'
})
// A full-window overlay leaves the page behind it without a scrollbar or its gutter (styles/main.css).
watchEffect(() => {
  document.documentElement.classList.toggle('overlay-open', ui.karaoke || ui.visualizer)
})
</script>

<template>
  <a
    href="#main"
    class="fixed -top-100 left-10 z-100 bg-white p-10 text-[#242521] focus:top-10"
    @click="skipToContent"
    >{{ t('skip_to_content') }}</a
  >
  <AppSidebar />
  <SidebarToggle />
  <div
    id="workspace"
    class="relative isolate ml-(--sidebar) min-h-screen pb-(--player) listening:mr-380"
    :class="{ 'listening-open': ui.panel }"
  >
    <AppTopbar />
    <main
      id="main"
      tabindex="-1"
      class="mx-auto max-w-1680 px-44 pt-34 pb-44 outline-none wide:px-60 wide:pt-40 wide:pb-48 compact:px-26 compact:pt-28 phone:px-18 phone:pt-23 phone:pb-28 listening:px-30"
    >
      <RouterView />
    </main>
  </div>
  <AppPlayerBar v-if="barVisible" />
  <ListeningPanel />
  <SearchPalette />
  <ConnectionDialog />
  <AppearanceDialog />
  <TrackMenuDialog />
  <SoundDialog />
  <ImportDialog />
  <PlaylistDialog />
  <KaraokeMode v-if="ui.karaoke" />
  <VisualizerMode v-if="ui.visualizer" />
  <CoverViewer />
  <AppToast />
</template>
