<script setup lang="ts">
/**
 * A small file manager for the player's card (owner, round 16): its folders
 * as the service lists them in one request, every visible file with its size
 * (combined-009; stock's transfer browser before), with what the library
 * knows about the music below each (tracks, measured size, the album they
 * form). Creates
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
import {
  breadcrumbs,
  folderNameProblem,
  folderParts,
  folderStats,
  joinFolder,
  sortEntries,
  visibleEntries,
} from '../domain/files'
import { CARD_ROOT } from '../domain/imports'
import type { LibraryTrack } from '../domain/track'
import { createFolder, listFolder, MAX_ENTRIES, type FolderListing } from '../gateway/files'
import { locale, t, type MessageKey } from '../i18n'
import { connection, http } from '../stores/connection'
import { cardChangedSinceListing, trash, trashPath } from '../stores/trash'
import { coverFor, enrichment, wantSizes } from '../stores/enrichment'
import { setImportDestination } from '../stores/imports'
import { tracks } from '../stores/library'
import { isPlaying, playback } from '../stores/playback'
import { operation, run } from '../stores/operation'
import { pairing, pairingToken } from '../stores/pairing'
import { openDialog, toast } from '../stores/ui'
import UiIcon from '../ui/UiIcon.vue'
import UiNowPlaying from '../ui/UiNowPlaying.vue'
import UiIconButton from '../ui/UiIconButton.vue'
import UiPillButton from '../ui/UiPillButton.vue'
import UiSkeleton from '../ui/UiSkeleton.vue'
import UiTextButton from '../ui/UiTextButton.vue'
import { playable } from '../gateway/folderSelection'
import { albumRoute } from './captions'
import { CARD_ROW, CARD_ROW_CURRENT } from './cardRows'
import RescanNote from './RescanNote.vue'
import { playFrom } from './playAlbum'
import { toggleCurrent } from './trackRows'

const route = useRoute()
const router = useRouter()
const folder = computed(() => folderParts(typeof route.query.folder === 'string' ? route.query.folder : '').join('/'))
const folderTo = (path: string) => ({ name: 'cardFiles', query: path ? { folder: path } : {} })

const listing = ref<FolderListing | null>(null)
/** Combined-009 lists the card itself; earlier images through stock's transfer browser. */
const serviceListing = computed(() => connection.historyWrites !== null)
const status = ref<'loading' | 'ready' | 'failed'>('loading')
let request = 0
async function load(): Promise<void> {
  const current = ++request
  status.value = 'loading'
  try {
    const result = await listFolder(http, folder.value, cardChangedSinceListing(), serviceListing.value)
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
  sortEntries(visibleEntries(listing.value?.entries ?? []), locale.value).map((entry) => {
    const path = joinFolder(folder.value, entry.name)
    if (entry.folder) return { entry, path, stats: folderStats(tracks.value, enrichment.files, path), track: null }
    const card = CARD_ROOT + path
    const track = byPath.value.get(card)?.[0] ?? null
    return { entry, path, stats: null, track, size: enrichment.files[card]?.bytes ?? entry.bytes ?? null }
  }),
)
const here = computed(() => folderStats(tracks.value, enrichment.files, folder.value))

/*
 * Playing from the card (owner, round 16): a folder plays from its first audio
 * file (stock's folder play, not its subfolders), a file plays within its
 * folder. The playing one pauses or resumes instead of starting again.
 */
type Row = (typeof rows.value)[number]
const playingPath = computed(() => playback.current.track?.path ?? null)
const canPlay = (row: Row) => (row.entry.folder ? true : playable(row.entry))
/** A track file shows its cover; the play layer darkens it instead of hiding it. */
const hasCover = (row: Row) => !row.entry.folder && Boolean(row.track)
function isCurrent(row: Row): boolean {
  const path = playingPath.value
  if (!path) return false
  if (!row.entry.folder) return path === CARD_ROOT + row.path
  return playback.current.source === 'folder' && path.slice(0, path.lastIndexOf('/')) === CARD_ROOT + row.path
}
const playLabel = (row: Row) =>
  isCurrent(row)
    ? `${t(isPlaying.value ? 'pause' : 'play')} ${row.entry.name}`
    : t('files_play', { name: row.entry.name })
function activate(row: Row): void {
  if (isCurrent(row)) {
    toggleCurrent()
    return
  }
  void playFrom(
    row.entry.folder
      ? { kind: 'folder', folder: row.path }
      : { kind: 'folder', folder: folder.value, file: row.entry.name },
  )
}
// Stock's listing has no sizes: the files shown are measured (once, remembered) so they appear.
watch(
  () => rows.value.flatMap((row) => (row.track && row.entry.bytes == null ? [row.track] : [])),
  (shown) => wantSizes(shown),
)
/** A file that is not a library track: its kind's icon (the service names kinds). */
function fileIcon(entry: Row['entry']): 'album' | 'lyrics' | 'playlist' | 'card' | 'music' {
  if (entry.image) return 'album'
  if (entry.kind === 'lyrics') return 'lyrics'
  if (entry.playlist) return 'playlist'
  if (entry.kind === 'other') return 'card'
  return 'music'
}
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
    return createFolder(http, token, parent, wanted, serviceListing.value)
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
/** Moves a file or folder into the service's trash after a confirmation naming it (combined-008). */
async function toTrash(row: Row): Promise<void> {
  if (!confirm(t('move_to_trash_confirm', { name: row.entry.name }))) return
  if (await trashPath(CARD_ROOT + row.path)) await load()
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
  <ViewHeading :eyebrow="t('your_player')" :title="t('card_section')" :meta="meta">
    <CardTabs current="files" :trash="connection.trash" />
  </ViewHeading>

  <RescanNote />
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
      <span v-if="problem" role="alert" class="w-full text-11 text-notice">{{ t(PROBLEM[problem]) }}</span>
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
      class="group/row flex items-center gap-14 border-b border-line py-9 last:border-b-0"
      :class="[CARD_ROW, { [CARD_ROW_CURRENT]: isCurrent(row) }]"
      :data-folder="row.entry.folder ? 'true' : undefined"
      :aria-current="isCurrent(row) ? 'true' : undefined"
    >
      <component
        :is="canPlay(row) ? 'button' : 'span'"
        :type="canPlay(row) ? 'button' : undefined"
        :aria-label="canPlay(row) ? playLabel(row) : undefined"
        :disabled="canPlay(row) ? !ready : undefined"
        class="relative grid size-36 shrink-0 place-items-center overflow-hidden rounded-6 p-0"
        :class="row.entry.folder || !row.track ? 'bg-soft text-secondary' : ''"
        @click="canPlay(row) && activate(row)"
      >
        <UiIcon v-if="row.entry.folder" name="folder" class="size-18" />
        <Artwork v-else-if="row.track" :title="row.track.album ?? row.track.title" :cover="coverFor(row.track)" />
        <UiIcon v-else :name="fileIcon(row.entry)" class="size-16" />
        <span
          v-if="canPlay(row)"
          aria-hidden="true"
          class="absolute inset-0 grid place-items-center transition-opacity duration-200"
          :class="[
            hasCover(row) ? (isCurrent(row) ? 'bg-[#0004] text-white' : 'bg-[#0006] text-white') : 'bg-hover text-ink',
            isCurrent(row) ? 'opacity-100' : 'opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100',
          ]"
        >
          <template v-if="isCurrent(row)">
            <UiNowPlaying :playing="isPlaying" class="group-focus-within/row:hidden group-hover/row:hidden" />
            <UiIcon
              filled
              :name="isPlaying ? 'pause' : 'play'"
              class="hidden size-14 group-focus-within/row:block group-hover/row:block"
            />
          </template>
          <UiIcon v-else filled name="play" class="size-14" />
        </span>
      </component>
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
      <UiIconButton
        v-if="connection.trash && writable"
        icon="trash"
        :label="`${t('move_to_trash')}: ${row.entry.name}`"
        :disabled="!ready || trash.busy || isCurrent(row)"
        class="opacity-60 group-focus-within/row:opacity-100 group-hover/row:opacity-100 [&>svg]:size-16"
        data-testid="files-trash"
        @click="toTrash(row)"
      />
    </li>
  </ul>
  <p v-if="listing?.truncated" class="mt-12 text-11 text-muted">{{ t('files_truncated', { count: MAX_ENTRIES }) }}</p>
  <p class="mt-20 text-11 leading-[1.6] text-muted">{{ t('files_note') }}</p>
</template>
