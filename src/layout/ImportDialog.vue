<script setup lang="ts">
/**
 * Adding music (reference #import-dialog): three steps — memory card, DISC
 * library, collection — each started by the user. Folders keep their
 * structure (picker or drop); transfer stops at the first unconfirmed file;
 * the scan runs once; the collection refreshes after its observed end.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { sizeLabel, splitPath } from '../domain/imports'
import { t, type MessageKey } from '../i18n'
import { droppedFiles, pickedFiles } from '../lib/dropFiles'
import { connection } from '../stores/connection'
import {
  addSelection,
  clearSelection,
  importFlow,
  imports,
  refreshCollection,
  setRefreshAfterScan,
  startScan,
  transferSelection,
  uploadLimit,
  type ImportPhase,
} from '../stores/imports'
import { library } from '../stores/library'
import { operation } from '../stores/operation'
import { pairing } from '../stores/pairing'
import { closeDialog, openDialog, ui } from '../stores/ui'
import UiDialog from '../ui/UiDialog.vue'
import UiIcon from '../ui/UiIcon.vue'
import UiPillButton from '../ui/UiPillButton.vue'
import UiTextButton from '../ui/UiTextButton.vue'

const router = useRouter()
const filesInput = ref<HTMLInputElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const ready = computed(
  () => connection.connection === 'connected' && connection.identity?.compatible === true && pairing.paired,
)
const locked = computed(() => imports.transferring || imports.scan.phase === 'scanning' || operation.busy)
const limit = computed(() => sizeLabel(uploadLimit.value))
const counts = computed(() => ({
  done: imports.items.filter((item) => item.phase === 'done').length,
  waiting: imports.items.filter((item) => item.phase === 'waiting').length,
  total: imports.items.length,
}))
const STEPS: MessageKey[] = ['import_step_card', 'import_step_index', 'import_step_saved']
const PHASE: Record<ImportPhase, MessageKey> = {
  waiting: 'import_waiting',
  sending: 'import_sending',
  done: 'import_done',
  exists: 'import_exists',
  'not-sent': 'import_not_sent',
  uncertain: 'import_uncertain',
}
const scanLabel = computed(() => {
  const phase = imports.scan.phase
  if (phase === 'idle') return null
  const key: MessageKey =
    phase === 'scanning'
      ? 'import_scanning'
      : phase === 'done'
        ? 'import_scan_done'
        : phase === 'not-sent'
          ? 'import_scan_not_sent'
          : 'import_scan_uncertain'
  return imports.scan.discovered === null
    ? t(key)
    : `${t(key)} · ${t('import_discovered', { count: imports.scan.discovered })}`
})

function choose(input: HTMLInputElement | null, folder: boolean): void {
  if (!input?.files) return
  addSelection(pickedFiles(input.files), folder)
  input.value = ''
}

async function drop(event: DragEvent): Promise<void> {
  dragging.value = false
  if (!event.dataTransfer || locked.value) return
  const { files, folder } = await droppedFiles(event.dataTransfer)
  addSelection(files, folder)
}

function openNew(): void {
  closeDialog()
  void router.push('/new')
}
</script>

<template>
  <UiDialog
    :open="ui.dialog === 'import'"
    :eyebrow="t('import_eyebrow')"
    :close-label="t('close')"
    size="xl"
    @close="closeDialog"
  >
    <h2 class="mt-14 mb-6 text-26 leading-[1.15] font-bold tracking-[-0.8px] phone:text-22">
      {{ t('import_title_1') }} {{ t('import_title_2') }}
    </h2>
    <p class="m-0 text-12 leading-[1.7] text-muted">{{ t('import_description') }}</p>

    <ol :aria-label="t('import_workflow')" class="my-18 grid list-none grid-cols-3 gap-8 p-0">
      <li
        v-for="(step, index) in STEPS"
        :key="step"
        :aria-current="importFlow.step === index ? 'step' : undefined"
        class="rounded-10 border px-12 py-9 text-11"
        :class="
          importFlow.step > index
            ? 'border-transparent bg-banner text-secondary'
            : importFlow.step === index
              ? 'border-secondary text-ink'
              : 'border-line text-muted'
        "
      >
        <span class="mr-6 font-semibold tabular-nums">{{ index + 1 }}</span
        >{{ t(step) }}
      </li>
    </ol>
    <p role="status" class="mt-0 mb-18 text-12 leading-[1.6] text-secondary" data-testid="import-flow">
      {{ ready ? t(importFlow.message) : t('import_connect') }}
    </p>

    <section class="border-t border-line pt-16">
      <span class="text-9 font-[650] tracking-[1.8px] text-muted">{{ t('import_step_transfer') }}</span>
      <div
        class="rounded-16 mt-10 grid place-items-center gap-8 border border-dashed px-16 py-22 text-center transition-colors duration-150"
        :class="dragging ? 'border-secondary bg-banner' : 'border-line bg-raised'"
        @dragover.prevent="dragging = !locked"
        @dragleave="dragging = false"
        @drop.prevent="drop"
      >
        <UiIcon name="upload" class="size-22 text-secondary" />
        <strong class="text-13">{{ t('import_drop') }}</strong>
        <small class="text-11 text-muted">{{ t('import_formats', { limit }) }}</small>
        <div class="mt-6 flex flex-wrap justify-center gap-8">
          <UiPillButton variant="secondary" :disabled="locked" @click="filesInput?.click()">{{
            t('import_choose')
          }}</UiPillButton>
          <UiPillButton variant="secondary" :disabled="locked" @click="folderInput?.click()">{{
            t('import_choose_folder')
          }}</UiPillButton>
        </div>
        <input
          ref="filesInput"
          type="file"
          multiple
          class="hidden"
          accept="audio/*,.flac,.ape,.dsf,.dff,.wma"
          @change="choose(filesInput, false)"
        />
        <input
          ref="folderInput"
          type="file"
          multiple
          webkitdirectory
          class="hidden"
          @change="choose(folderInput, true)"
        />
      </div>
      <p class="mt-8 mb-0 text-10 text-muted">
        {{ t('import_no_overwrite')
        }}<template v-if="imports.skipped"> · {{ t('import_skipped', { count: imports.skipped }) }}</template>
      </p>
      <ul
        v-if="imports.items.length"
        class="mt-12 mb-0 max-h-220 list-none overflow-auto overscroll-contain p-0"
        data-testid="import-files"
      >
        <li v-for="item in imports.items" :key="item.id" class="border-t border-line/70 py-8 first:border-t-0">
          <div class="flex items-center gap-10 text-11">
            <UiIcon :name="item.phase === 'done' ? 'music' : 'upload'" class="size-15 shrink-0 text-secondary" />
            <span class="min-w-0 flex-1">
              <strong class="block truncate font-[550]" :title="item.path">{{ splitPath(item.path).name }}</strong>
              <small class="block truncate text-10 text-muted"
                >{{ splitPath(item.path).folder || '/' }} · {{ sizeLabel(item.size) }}</small
              >
            </span>
            <span
              class="shrink-0 text-right text-10"
              :class="
                item.phase === 'done'
                  ? 'text-secondary'
                  : ['uncertain', 'not-sent', 'exists'].includes(item.phase)
                    ? 'text-accent'
                    : 'text-muted'
              "
              >{{
                item.phase === 'sending'
                  ? `${Math.round((100 * item.sent) / Math.max(1, item.size))}%`
                  : item.phase === 'done'
                    ? '✓'
                    : ''
              }}<span class="sr-only"> {{ t(PHASE[item.phase]) }}</span></span
            >
          </div>
          <p
            v-if="['uncertain', 'not-sent', 'exists'].includes(item.phase)"
            class="mt-4 mb-0 pl-25 text-10 text-accent"
          >
            {{ t(PHASE[item.phase]) }}
          </p>
          <div v-if="item.phase === 'sending'" class="mt-6 ml-25 h-3 overflow-hidden rounded-3 bg-progress-bg">
            <div class="h-full bg-progress-fill" :style="{ width: `${(100 * item.sent) / Math.max(1, item.size)}%` }" />
          </div>
        </li>
      </ul>
      <div class="mt-12 flex flex-wrap items-center justify-between gap-10">
        <small class="text-10 text-muted">{{ counts.total ? t('import_batch_count', counts) : '' }}</small>
        <div class="flex gap-10">
          <UiTextButton :disabled="locked || !counts.total" @click="clearSelection">{{
            t('import_clear')
          }}</UiTextButton>
          <UiPillButton icon="upload" :disabled="locked || !counts.waiting || !ready" @click="transferSelection">{{
            t('import_send')
          }}</UiPillButton>
        </div>
      </div>
    </section>

    <section class="mt-18 border-t border-line pt-16">
      <span class="text-9 font-[650] tracking-[1.8px] text-muted">{{ t('import_step_scan') }}</span>
      <h3 class="mt-8 mb-4 text-15 font-semibold">{{ t('import_scan_title') }}</h3>
      <p class="m-0 text-11 leading-[1.6] text-muted">{{ t('import_scan_description') }}</p>
      <div class="mt-12 flex flex-wrap items-center justify-between gap-10">
        <span
          v-if="scanLabel"
          role="status"
          class="flex items-center gap-8 text-11 text-secondary"
          data-testid="scan-status"
        >
          <i
            v-if="imports.scan.phase === 'scanning'"
            aria-hidden="true"
            class="size-7 animate-pulse rounded-full bg-accent motion-reduce:animate-none"
          />{{ scanLabel }}
        </span>
        <span v-else />
        <UiPillButton variant="secondary" :disabled="locked || !ready" @click="startScan">{{
          t('import_scan')
        }}</UiPillButton>
      </div>
    </section>

    <section class="mt-18 border-t border-line pt-16">
      <span class="text-9 font-[650] tracking-[1.8px] text-muted">{{ t('import_step_sync') }}</span>
      <h3 class="mt-8 mb-4 text-15 font-semibold">{{ t('import_sync_title') }}</h3>
      <label class="mt-6 flex items-center gap-8 text-11 text-muted">
        <input
          type="checkbox"
          :checked="imports.refreshAfterScan"
          class="accent-progress-fill"
          @change="setRefreshAfterScan(($event.target as HTMLInputElement).checked)"
        />
        {{ t('import_refresh_after_scan') }}
      </label>
      <div class="mt-12 flex flex-wrap items-center justify-between gap-10">
        <small class="text-11 text-muted">{{
          imports.collection === 'done' ? t('import_collection_count', { count: library.tracks.length }) : ''
        }}</small>
        <div class="flex gap-10">
          <UiPillButton
            v-if="importFlow.step === 2 && imports.collection !== 'refreshing'"
            variant="secondary"
            @click="refreshCollection"
            >{{ t('import_refresh_now') }}</UiPillButton
          >
          <UiPillButton v-if="importFlow.step === 3" icon="arrow" @click="openNew">{{
            t('import_open_new')
          }}</UiPillButton>
        </div>
      </div>
    </section>
    <p v-if="!pairing.paired" class="mt-16 text-11 text-muted">
      <UiTextButton class="inline-flex text-11" @click="openDialog('connection')">{{ t('pairing') }} →</UiTextButton>
    </p>
  </UiDialog>
</template>
