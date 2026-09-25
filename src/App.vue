<script setup lang="ts">
import { onMounted, watchEffect } from 'vue'
import { locale } from './i18n'
import AppHeader from './layout/AppHeader.vue'
import ConnectionPanel from './panels/ConnectionPanel.vue'
import NowPlayingPanel from './panels/NowPlayingPanel.vue'
import PairingPanel from './panels/PairingPanel.vue'
import { probeGateway } from './stores/connection'
import { loadLibraryFacts } from './stores/library'
import './stores/appearance'

onMounted(async () => {
  if (await probeGateway()) await loadLibraryFacts()
})
watchEffect(() => {
  document.documentElement.lang = locale.value
})
</script>

<template>
  <AppHeader />
  <main class="mx-auto grid max-w-5xl gap-4 p-4 sm:gap-5 sm:p-6 md:grid-cols-2">
    <ConnectionPanel />
    <NowPlayingPanel class="md:row-span-2" />
    <PairingPanel />
  </main>
</template>
