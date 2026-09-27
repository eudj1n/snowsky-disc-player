<script setup lang="ts">
/**
 * A small file manager for the player's card (owner, round 16): its folders
 * as stock's transfer browser lists them, with what the library knows about
 * the music below each (tracks, measured size, the album they form). Creates
 * a folder and adds music into the folder shown; deleting, renaming and
 * moving stay in USB storage mode (the service denies stock's file deletion
 * and stock has no rename).
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Artwork from '../components/artwork/Artwork.vue'
import CardTabs from '../components/card/CardTabs.vue'
import ViewHeading from '../components/common/ViewHeading.vue'
import { formatBytes } from '../domain/device'
import { breadcrumbs, folderNameProblem, folderParts, folderStats, joinFolder, sortEntries } from '../domain/files'
import { CARD_ROOT } from '../domain/imports'
import type { LibraryTrack } from '../domain/track'
import { createFolder, listFolder, MAX_ENTRIES, type FolderListing } from '../gateway/files'
import { locale, t, type MessageKey } from '../i18n'
import { connection, http } from '../stores/connection'
import { coverFor, enrichment, wantSizes } from '../stores/enrichment'
import { setImportDestination } from '../stores/imports'
import { tracks } from '../stores/library'
import { operation, run } from '../stores/operation'
import { pairing, pairingToken } from '../stores/pairing'
import { openDialog, toast } from '../stores/ui'
import UiIcon from '../ui/UiIcon.vue'
import UiPillButton from '../ui/UiPillButton.vue'
import UiSkeleton from '../ui/UiSkeleton.vue'
import UiTextButton from '../ui/UiTextButton.vue'
import { albumRoute } from './captions'

const route = useRoute()
const router = useRouter()
const folder = computed(() => folderParts(typeof route.query.folder === 'string' ? route.query.folder : '').join('/'))
const folderTo = (path: string) => ({ name: 'cardFiles', query: path ? { folder: path } : {} })

const listing = ref<FolderListing | null>(null)
const status = ref<'loading' | 'ready' | 'failed'>('loading')
let request = 0
async function load(): Promise<void> {
  const current = ++request
  status.value = 'loading'
  try {
    const result = await listFolder(http, folder.value)
    if (current !== request) return
    listing.value = result
    status.value = 'ready'
  } catch {
    if (current === request) status.value = 'failed'
  }
}
watch(folder, () => void load(), { immediate: true })

/** Library tracks by card path (a CUE image's file holds several). */
const byPath = computed(() => {
  const map = new Map<string, LibraryTrack[]>()
  for (const track of tracks.value) if (track.path) map.set(track.path, [...(map.get(track.path) ?? []), track])
  return map
})
const bytes = (value: number) => formatBytes(value, locale.value)
const rows = computed(() =>
  sortEntries(listing.value?.entries ?? [], locale.value).map((entry) => {
    const path = joinFolder(folder.value, entry.name)
    if (entry.folder) return { entry, path, stats: folderStats(tracks.value, enrichment.files, path), track: null }
    const card = CARD_ROOT + path
    const track = byPath.value.get(card)?.[0] ?? null
    return { entry, path, stats: null, track, size: enrichment.files[card]?.bytes ?? null }
  }),
)
const here = computed(() => folderStats(tracks.value, enrichment.files, folder.value))
// The files shown are measured (once, remembered) so their sizes appear.
watch(
  () => rows.value.flatMap((row) => (row.track ? [row.track] : [])),
  (shown) => wantSizes(shown),
)
const meta = computed(() => {
  if (status.value !== 'ready') return null
  const parts = [t('folder_entries', { count: rows.value.length })]
  if (here.value.tracks) parts.push(t('track_count', { count: here.value.tracks }))
  if (here.value.measured) parts.push(bytes(here.value.bytes))
  return parts.join(' · ')
})

const ready = computed(
  () => connection.connection === 'connected' && connection.identity?.compatible === true && pairing.paired,
)
/** The service keeps its own folders out of reach; nothing is added inside them. */
const writable = computed(() => folderNameProblem('x', folder.value) === null)

const naming = ref(false)
const name = ref('')
const nameInput = ref<HTMLInputElement | null>(null)
const PROBLEM: Record<'empty' | 'reserved' | 'invalid', MessageKey> = {
  empty: 'files_name_empty',
  reserved: 'files_name_reserved',
  invalid: 'files_name_invalid',
}
const problem = computed(() => (naming.value && name.value ? folderNameProblem(name.value, folder.value) : null))
async function startNaming(): Promise<void> {
  naming.value = true
  name.value = ''
  await nextTick()
  nameInput.value?.focus()
}
async function create(): Promise<void> {
  const token = pairingToken()
  const wanted = name.value
  const issue = folderNameProblem(wanted, folder.value)
  if (issue) {
    toast(PROBLEM[issue], true)
    return
  }
  if (!token) return
  const parent = folder.value
  const outcome = await run('folder', async (context) => {
    await context.pace()
    context.guard()
    context.attempted()
    return createFolder(http, token, parent, wanted)
  }).catch(() => 'not-sent' as const)
  if (outcome === 'busy' || outcome === 'no-session') {
    toast(outcome === 'busy' ? 'please_wait_for_the_current_request' : 'pair_to_control')
    return
  }
  const key: MessageKey =
    outcome === 'created'
      ? 'files_created'
      : outcome === 'exists'
        ? 'files_exists'
        : outcome === 'not-sent'
          ? 'files_not_created'
          : 'files_uncertain'
  toast(key, outcome !== 'created' && outcome !== 'exists')
  if (outcome === 'created' || outcome === 'exists') {
    naming.value = false
    await router.push(folderTo(joinFolder(parent, wanted)))
  }
}
function addHere(): void {
  if (!setImportDestination(folder.value)) {
    toast('import_flow_selected')
    return
  }
  openDialog('import')
}
</script>

<template>
  <ViewHeading :eyebrow="t('your_player')" :title="t('card_section')" :meta="meta" />
  <CardTabs current="files" />

  <nav
    :aria-label="t('files_breadcrumbs')"
    class="mb-14 flex flex-wrap items-center gap-4 text-13"
    data-testid="files-path"
  >
    <template v-for="(crumb, index) in breadcrumbs(folder)" :key="crumb.folder">
      <span v-if="index" aria-hidden="true" class="text-muted">/</span>
      <RouterLink
        v-if="crumb.folder !== folder"
        :to="folderTo(crumb.folder)"
        class="rounded-6 px-4 py-2 text-secondary hover:bg-hover hover:text-ink"
        >{{ crumb.name ?? t('files_root') }}</RouterLink
      >
      <strong v-else class="px-4 py-2 font-semibold" aria-current="page">{{ crumb.name ?? t('files_root') }}</strong>
    </template>
  </nav>

  <div class="mb-16 flex flex-wrap items-center gap-10">
    <UiPillButton
      icon="add-music"
      :disabled="!ready || !writable || operation.busy"
      data-testid="files-add"
      @click="addHere"
      >{{ t('files_add_here') }}</UiPillButton
    >
    <UiPillButton
      v-if="!naming"
      variant="secondary"
      icon="folder"
      :disabled="!ready || !writable || operation.busy"
      @click="startNaming"
      >{{ t('files_new_folder') }}</UiPillButton
    >
    <form v-else class="flex flex-wrap items-center gap-8" @submit.prevent="create">
      <input
        ref="nameInput"
        v-model="name"
        :aria-label="t('files_folder_name')"
        :placeholder="t('files_folder_name')"
        maxlength="120"
        class="h-36 w-240 rounded-18 border border-line bg-raised px-14 text-13 outline-none focus:border-secondary"
        @keydown.esc.stop="naming = false"
      />
      <UiPillButton type="submit" :disabled="!name || problem !== null || operation.busy">{{
        t('files_create')
      }}</UiPillButton>
      <UiTextButton class="text-12" @click="naming = false">{{ t('files_cancel') }}</UiTextButton>
      <span v-if="problem" role="alert" class="w-full text-11 text-accent">{{ t(PROBLEM[problem]) }}</span>
    </form>
  </div>
  <p v-if="!ready" class="mt-0 mb-14 text-11 text-muted">{{ t('files_pair') }}</p>

  <div v-if="status === 'loading' && !listing" :aria-busy="true">
    <div v-for="n in 6" :key="n" class="flex items-center gap-14 border-b border-line py-10">
      <UiSkeleton class="size-36 rounded-6" /><UiSkeleton class="h-10 w-[40%]" />
    </div>
  </div>
  <p v-else-if="status === 'failed'" role="status" class="text-12 text-muted">
    {{ t('files_failed') }} <UiTextButton class="text-12" @click="load">{{ t('refresh') }}</UiTextButton>
  </p>
  <p v-else-if="!rows.length" role="status" class="text-12 text-muted" data-testid="files-empty">
    {{ t('files_empty') }}
  </p>
  <ul v-else class="m-0 list-none p-0" data-testid="files-list" :aria-busy="status === 'loading'">
    <li
      v-for="row in rows"
      :key="row.entry.name"
      class="flex items-center gap-14 border-b border-line py-9 last:border-b-0"
      :data-folder="row.entry.folder ? 'true' : undefined"
    >
      <span
        class="grid size-36 shrink-0 place-items-center overflow-hidden rounded-6"
        :class="row.entry.folder || !row.track ? 'bg-soft text-secondary' : ''"
      >
        <UiIcon v-if="row.entry.folder" name="folder" class="size-18" />
        <Artwork v-else-if="row.track" :title="row.track.album ?? row.track.title" :cover="coverFor(row.track)" />
        <UiIcon v-else :name="row.entry.image ? 'album' : 'music'" class="size-16" />
      </span>
      <div class="min-w-0 flex-1">
        <RouterLink
          v-if="row.entry.folder"
          :to="folderTo(row.path)"
          class="block truncate text-13 font-semibold hover:underline"
          >{{ row.entry.name }}</RouterLink
        >
        <span v-else class="block truncate text-13">{{ row.entry.name }}</span>
        <p class="m-0 mt-2 truncate text-11 text-muted">
          <template v-if="row.stats">
            <template v-if="row.stats.tracks">{{ t('track_count', { count: row.stats.tracks }) }}</template>
            <template v-if="row.stats.album">
              ·
              <RouterLink :to="albumRoute(row.stats.album)" class="hover:text-ink hover:underline">{{
                t('files_album', { name: row.stats.album })
              }}</RouterLink>
            </template>
          </template>
          <template v-else-if="row.track">
            {{ row.track.title }}
            <template v-if="row.track.album">
              ·
              <RouterLink
                :to="albumRoute(row.track.album, row.track.artist || null)"
                class="hover:text-ink hover:underline"
                >{{ row.track.album }}</RouterLink
              >
            </template>
          </template>
        </p>
      </div>
      <span class="w-72 shrink-0 text-right text-12 font-semibold text-secondary tabular-nums">
        {{
          row.stats ? (row.stats.measured ? bytes(row.stats.bytes) : '') : row.size !== null ? bytes(row.size ?? 0) : ''
        }}
      </span>
    </li>
  </ul>
  <p v-if="listing?.truncated" class="mt-12 text-11 text-muted">{{ t('files_truncated', { count: MAX_ENTRIES }) }}</p>
  <p class="mt-20 text-11 leading-[1.6] text-muted">{{ t('files_note') }}</p>
</template>
