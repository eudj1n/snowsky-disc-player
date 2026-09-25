<script setup lang="ts">
import { t } from '../i18n'
import { ui } from '../stores/ui'
</script>

<template>
  <div
    v-if="ui.toast"
    :key="ui.toast.id"
    role="status"
    data-testid="toast"
    :data-error="ui.toast.error"
    class="fixed bottom-[calc(var(--player)+18px)] left-1/2 z-50 max-w-[min(600px,90vw)] -translate-x-1/2 rounded-12 px-23 py-14 text-12 leading-[1.6] text-[#f1f5e9] shadow-[0_8px_25px_#23301725]"
    :class="ui.toast.error ? 'bg-[#653c32]' : 'bg-[#2e3829]'"
  >
    {{ t(ui.toast.key) }}
  </div>
</template>
