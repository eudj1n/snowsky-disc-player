<script setup lang="ts">
/**
 * The Card page's third view (combined-008): the service's trash in
 * `.disc/trash`, with each entry's origin, size and time, Restore and Delete
 * permanently, Empty trash, and what macOS left on the card, which moves to
 * the trash as one entry.
 */
import { computed, onMounted } from 'vue'
import CardTabs from '../components/card/CardTabs.vue'
import ViewHeading from '../components/common/ViewHeading.vue'
import { CARD_ROOT } from '../domain/imports'
import { formatBytes } from '../domain/device'
import { entryFolder, entryName, type TrashEntry } from '../domain/trash'
import { locale, t } from '../i18n'
import { connection } from '../stores/connection'
import { emptyAll, loadTrash, moveLeftovers, purgeEntry, restoreEntry, trash } from '../stores/trash'
import UiIcon from '../ui/UiIcon.vue'
import UiPillButton from '../ui/UiPillButton.vue'
import UiTextButton from '../ui/UiTextButton.vue'
import { CARD_ROW } from './cardRows'
import RescanNote from './RescanNote.vue'

onMounted(() => void loadTrash())
const bytes = (value: number) => formatBytes(value, locale.value)
const entries = computed(() => trash.listing?.entries ?? [])
const meta = computed(() =>
  trash.listing ? t('trash_total', { count: trash.listing.count, size: bytes(trash.listing.bytes) }) : null,
)
const root = CARD_ROOT.replace(/\/$/, '')
const name = (entry: TrashEntry) => entryName(entry) ?? t('leftovers_entry')
const from = (entry: TrashEntry) => {
  const folder = entry.kind === 'leftovers' ? '' : entryFolder(entry, root)
  return t('trash_from', { folder: folder || t('trash_card_root') })
}
const when = (entry: TrashEntry) =>
  entry.trashed
    ? new Date(entry.trashed * 1000).toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' })
    : ''

async function purge(entry: TrashEntry): Promise<void> {
  if (confirm(t('trash_delete_confirm', { name: name(entry) }))) await purgeEntry(entry.id)
}
async function empty(): Promise<void> {
  if (confirm(t('trash_empty_confirm'))) await emptyAll()
}
</script>

<template>
  <ViewHeading :eyebrow="t('your_player')" :title="t('card_section')" :meta="meta">
    <CardTabs current="trash" :trash="connection.trash" />
  </ViewHeading>
  <p v-if="!connection.trash" role="status" class="text-footnote text-muted">{{ t('about_unavailable') }}</p>
  <template v-else>
    <RescanNote />
    <section :aria-label="t('trash_tab')" class="mb-32">
      <div class="mb-12 flex flex-wrap items-center justify-between gap-10">
        <h2 class="m-0 text-title3 font-semibold">{{ t('trash_tab') }}</h2>
        <UiPillButton
          v-if="entries.length"
          icon="trash"
          variant="secondary"
          :disabled="trash.busy"
          data-testid="trash-empty"
          @click="empty"
          >{{ t('trash_empty_all') }}</UiPillButton
        >
      </div>
      <p v-if="!entries.length" class="text-footnote text-muted" data-testid="trash-nothing">
        {{ t('trash_nothing') }}
      </p>
      <ul v-else class="m-0 list-none p-0" data-testid="trash-list">
        <li
          v-for="entry in entries"
          :key="entry.id"
          class="flex flex-wrap items-center gap-14 border-b border-line py-10 last:border-b-0"
          :class="CARD_ROW"
        >
          <span class="grid size-36 shrink-0 place-items-center rounded-6 bg-soft text-secondary">
            <UiIcon :name="entry.kind === 'file' ? 'music' : 'folder'" class="size-16" />
          </span>
          <div class="min-w-0 flex-1">
            <strong class="block truncate text-body font-semibold">{{ name(entry) }}</strong>
            <p class="m-0 mt-2 truncate text-footnote text-muted">
              {{ from(entry) }} · {{ when(entry) }}
              <template v-if="!entry.complete"> · {{ t('trash_interrupted') }}</template>
            </p>
          </div>
          <span class="w-72 shrink-0 text-right text-body font-semibold text-secondary tabular-nums">{{
            bytes(entry.bytes)
          }}</span>
          <UiTextButton class="text-footnote" :disabled="trash.busy" @click="restoreEntry(entry.id)">{{
            t('trash_restore')
          }}</UiTextButton>
          <UiTextButton class="text-footnote" :disabled="trash.busy" @click="purge(entry)">{{
            t('trash_delete')
          }}</UiTextButton>
        </li>
      </ul>
    </section>
    <section :aria-label="t('leftovers_title')" data-testid="leftovers">
      <h2 class="m-0 mb-6 text-title3 font-semibold">{{ t('leftovers_title') }}</h2>
      <p class="m-0 mb-12 max-w-640 text-footnote leading-[1.55] text-muted">{{ t('leftovers_hint') }}</p>
      <div v-if="trash.leftovers && trash.leftovers.files" class="flex flex-wrap items-center gap-12">
        <span class="text-body">{{
          t('leftovers_found', { count: trash.leftovers.files, size: bytes(trash.leftovers.bytes) })
        }}</span>
        <UiPillButton
          icon="trash"
          variant="secondary"
          :disabled="trash.busy"
          data-testid="leftovers-move"
          @click="moveLeftovers"
          >{{ t('move_to_trash') }}</UiPillButton
        >
      </div>
      <p v-else class="m-0 text-footnote text-muted">{{ t('leftovers_none') }}</p>
    </section>
  </template>
</template>
