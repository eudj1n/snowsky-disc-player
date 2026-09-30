<script setup lang="ts">
/**
 * After music moved to or from the trash (combined-008): stock drops or
 * finds the tracks only with the next scan, which this note offers.
 */
import { watch } from 'vue'
import { t } from '../i18n'
import { imports, startScan } from '../stores/imports'
import { libraryRescanned, trash } from '../stores/trash'
import UiPillButton from '../ui/UiPillButton.vue'

watch(
  () => imports.scan.phase,
  (phase) => {
    if (phase === 'done') libraryRescanned()
  },
)
</script>

<template>
  <div
    v-if="trash.rescan"
    role="status"
    data-testid="trash-rescan"
    class="mb-16 flex flex-wrap items-center gap-12 rounded-12 border border-line bg-raised px-16 py-12 text-footnote"
  >
    <span class="min-w-0 flex-1">{{ t('trash_rescan') }}</span>
    <UiPillButton icon="refresh" variant="secondary" :disabled="imports.scan.phase === 'scanning'" @click="startScan">{{
      t('import_scan')
    }}</UiPillButton>
  </div>
</template>
