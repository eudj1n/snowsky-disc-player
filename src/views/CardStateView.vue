<script setup lang="ts">
/**
 * The Card section's State tab (owner, 2026-10-02): what the library lacks
 * and its enrichment. The state is counted from what the page knows and one
 * walk of the card; each count leads into the enrichment with its task ticked,
 * or to its list. The enrichment runs inside the tab, not in a window (a long
 * run should not hold one): first what it will do, then the run (automatic
 * or manual), then the report with the files for the card, written only
 * after their own review, and the run's undo. A run keeps going while the
 * page shows another section, and the Card item carries a dot meanwhile.
 */
import { computed, onMounted, ref, watch } from 'vue'
import CardTabs from '../components/card/CardTabs.vue'
import ViewHeading from '../components/common/ViewHeading.vue'
import { stockUnknown } from '../domain/album'
import { libraryState } from '../domain/libraryState'
import { duplicates } from '../domain/space'
import { inTrash } from '../domain/trash'
import { locale, t, type MessageKey } from '../i18n'
import IdentifyChoices from '../layout/IdentifyChoices.vue'
import type { IdentifyTarget } from '../layout/identify'
import { chosenImage, hasArtistPhoto } from '../stores/artistPictures'
import { albumIdentityKey } from '../stores/coverSearch'
import { connection } from '../stores/connection'
import { albumCoverState, enrichment, enrichmentLoaded, measureCard, sizeUnreadable } from '../stores/enrichment'
import { autoImageRole } from '../stores/externalSources'
import { albums, artists, library, tracks } from '../stores/library'
import {
  chooseFile,
  closeRun,
  confirmChoice,
  continueRun,
  dismissInterrupted,
  libraryRun,
  loadRuns,
  pauseRun,
  reviewRun,
  runActive,
  runReady,
  skipChoice,
  startRun,
  stopRun,
  taskAllowed,
  undoRun,
  writeFiles,
  type RunMode,
  type RunTask,
} from '../stores/libraryRun'
import { albumIdentity, artistIdentity, identifyAllowed, identifying } from '../stores/musicbrainzIds'
import { pairing } from '../stores/pairing'
import { loadTrash, trash } from '../stores/trash'
import UiChips from '../ui/UiChips.vue'
import UiPillButton from '../ui/UiPillButton.vue'
import UiSelect from '../ui/UiSelect.vue'
import UiTextButton from '../ui/UiTextButton.vue'
import { albumScope } from '../domain/album'
import CollectionGate from './CollectionGate.vue'

const mainArtists = computed(() => artists.value.filter((artist) => artist.own))
const state = computed(() =>
  libraryState({
    tracks: tracks.value,
    albums: albums.value,
    artists: mainArtists.value,
    identifiedArtist: (name) => artistIdentity(name) !== null,
    identifiedAlbum: (album) => albumIdentity(albumIdentityKey(album, albumScope(album))) !== null,
    coverState: (album) => albumCoverState(album, albumScope(album)),
    photo: hasArtistPhoto,
    background: (name) => chosenImage(name, 'background') !== null,
    walk: enrichment.walk,
    years: enrichment.years,
  }),
)
const paths = computed(() => [...new Set(tracks.value.flatMap((track) => (track.path ? [track.path] : [])))])
const unreadable = computed(() => paths.value.filter((path) => !enrichment.files[path] && sizeUnreadable(path)))
/** What the trash holds is no duplicate of anything, though the library lists it until the next scan. */
const duplicateRows = computed(() =>
  duplicates(
    tracks.value.filter((track) => !track.path || !inTrash(track.path, trash.listing?.entries ?? [])),
    enrichment.files,
  ),
)
const unknownTagged = computed(() =>
  tracks.value.filter((track) => stockUnknown(track.artist) || stockUnknown(track.album) || stockUnknown(track.genre)),
)
const cueImages = computed(
  () => new Set(tracks.value.flatMap((track) => (track.cue && track.path ? [track.path] : []))),
)

/** One walk of the card a visit, for its .lrc and image files, years and unreadable files. */
async function walk(): Promise<void> {
  await enrichmentLoaded()
  if (enrichment.walk || connection.historyWrites === null) return
  await measureCard(paths.value, cueImages.value)
}
onMounted(() => {
  void loadRuns()
  if (connection.trash) void loadTrash()
})
watch(
  () => [library.status, connection.media, paths.value.length] as const,
  ([status, media]) => {
    if (status === 'ready' && media) void walk()
  },
  { immediate: true },
)

/** Why the enrichment cannot start, if so (it stays in place, disabled). */
const blocked = computed<MessageKey | null>(() =>
  !identifyAllowed()
    ? 'state_needs_musicbrainz'
    : !pairing.stored
      ? 'state_needs_pair'
      : !libraryRun.available
        ? 'state_needs_release'
        : null,
)

/* The first step: what the run will do. */
const configuring = ref(false)
const tasks = ref<RunTask[]>([])
const mode = ref<RunMode>('auto')
const scope = ref<string>('')
const roles = computed(() => (['photo', 'background'] as const).filter((role) => autoImageRole(role)))
const TASKS: readonly RunTask[] = ['artists', 'albums', 'covers', 'images', 'lyrics']
const taskCount = (task: RunTask): number => {
  const value = state.value
  if (task === 'artists') return value.artists.total - value.artists.identified
  if (task === 'albums') return value.albums.total - value.albums.identified
  if (task === 'covers') return value.albums.covers.none + value.albums.covers.unknown
  if (task === 'images')
    return (
      (roles.value.includes('photo') ? value.artists.total - value.artists.photo : 0) +
      (roles.value.includes('background') ? value.artists.total - value.artists.background : 0)
    )
  return value.lyrics.tracks - (value.lyrics.sidecar ?? 0)
}
function configure(preset: readonly RunTask[]): void {
  tasks.value = preset.filter((task) => taskAllowed(task) && (task !== 'images' || roles.value.length > 0))
  configuring.value = true
}
function toggleTask(task: RunTask, on: boolean): void {
  tasks.value = on ? [...new Set([...tasks.value, task])] : tasks.value.filter((item) => item !== task)
}
/** MusicBrainz is asked once a second: about one request an artist and an album to identify. */
const requests = computed(
  () =>
    (tasks.value.includes('artists') ? taskCount('artists') : 0) +
    (tasks.value.includes('albums') || tasks.value.includes('covers') ? taskCount('albums') : 0),
)
const minutes = computed(() => Math.max(1, Math.ceil((requests.value * 1.1) / 60)))
const modes = computed(() => [
  { value: 'auto' as const, text: t('state_mode_auto') },
  { value: 'manual' as const, text: t('state_mode_manual') },
])
async function start(): Promise<void> {
  configuring.value = false
  await startRun({ tasks: [...tasks.value], mode: mode.value, artist: scope.value || null })
}
async function resume(): Promise<void> {
  const open = libraryRun.interrupted
  if (open) await startRun({ ...open.settings, tasks: [...open.settings.tasks] }, open.run)
}

/* The run under way. */
const current = computed(() => libraryRun.current)
const progress = computed(() =>
  libraryRun.total ? Math.round((Math.min(libraryRun.index, libraryRun.total) / libraryRun.total) * 100) : 0,
)
const STEPS: Record<string, MessageKey> = {
  identify: 'state_step_identify',
  images: 'state_step_images',
  cover: 'state_step_cover',
  lyrics: 'state_step_lyrics',
}
const OUTCOMES: Record<string, MessageKey> = {
  identified: 'state_outcome_identified',
  review: 'state_outcome_review',
  missing: 'state_outcome_missing',
  skipped: 'state_outcome_skipped',
  failed: 'state_outcome_failed',
  done: 'state_outcome_done',
}
const MARKS: Record<string, string> = {
  identified: '✓',
  done: '✓',
  review: '?',
  missing: '—',
  skipped: '—',
  failed: '!',
}

/* The owner's step: the candidates of the item under way. */
const target = computed<IdentifyTarget | null>(() => {
  const item = current.value
  if (libraryRun.phase !== 'waiting' || !item) return null
  return item.kind === 'artist'
    ? { kind: 'artist', name: item.name }
    : { kind: 'album', key: item.name, title: item.title, artist: item.artist, trackCount: item.trackCount }
})
const chosen = ref<string | null>(null)
// The best candidate comes chosen: the owner confirms or picks another.
watch(
  () => [target.value?.kind, identifying.status, identifying.view] as const,
  () => {
    if (identifying.status !== 'ready' || identifying.view === 'groups') return
    chosen.value =
      target.value?.kind === 'artist' ? (identifying.artists[0]?.id ?? null) : (identifying.editions[0]?.id ?? null)
  },
)
watch(current, () => (chosen.value = null))
async function confirm(): Promise<void> {
  if (chosen.value) await confirmChoice(chosen.value)
}

/* The report. */
const covers = computed(() => libraryRun.files.filter((file) => file.kind === 'cover'))
const lyrics = computed(() => libraryRun.files.filter((file) => file.kind === 'lyrics'))
const written = computed(() => libraryRun.files.filter((file) => file.status === 'written').length)
const waitingFiles = computed(() => libraryRun.files.some((file) => file.chosen && file.status === 'new'))
const FILE_STATUS: Record<string, MessageKey> = {
  written: 'state_file_written',
  exists: 'state_file_exists',
  failed: 'state_file_failed',
}
const undone = ref<boolean | null>(null)
async function undo(): Promise<void> {
  undone.value = await undoRun()
}
function close(): void {
  undone.value = null
  closeRun()
}

const lists = ref<{ tags: boolean; unreadable: boolean }>({ tags: false, unreadable: false })
const cardFolder = (path: string) => path.replace(/^\/tmp\/sdcard\/?/, '')
const number = (value: number) => new Intl.NumberFormat(locale.value).format(value)
const ROW =
  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-16 gap-y-6 border-b border-line py-14 phone:grid-cols-[minmax(0,1fr)]'
</script>

<template>
  <CollectionGate :count="tracks.length">
    <template #heading>
      <ViewHeading :eyebrow="t('your_player')" :title="t('card_section')">
        <div class="flex flex-wrap items-center gap-12 self-end">
          <CardTabs current="state" :trash="connection.trash" />
        </div>
      </ViewHeading>
    </template>

    <div class="max-w-860" data-testid="card-state">
      <!-- The state, while no run is going and none is being set up. -->
      <template v-if="libraryRun.phase === 'idle' && !configuring">
        <p
          v-if="libraryRun.interrupted"
          class="mt-0 mb-20 flex flex-wrap items-center gap-x-14 gap-y-8 rounded-12 border border-line bg-raised px-16 py-12 text-footnote text-secondary"
          role="status"
          data-testid="state-interrupted"
        >
          {{ t('state_interrupted') }}
          <UiTextButton :disabled="blocked !== null" data-testid="state-resume" @click="resume">{{
            t('state_resume')
          }}</UiTextButton>
          <UiTextButton data-testid="state-dismiss" @click="dismissInterrupted">{{ t('state_dismiss') }}</UiTextButton>
        </p>
        <div class="border-t border-line">
          <div :class="ROW" data-testid="state-identified">
            <div>
              <h2 class="m-0 text-callout font-semibold">{{ t('state_identified') }}</h2>
              <p class="m-0 text-footnote text-muted [font-variant-numeric:tabular-nums]">
                {{
                  t('state_identified_facts', {
                    artists: number(state.artists.identified),
                    artistsTotal: number(state.artists.total),
                    albums: number(state.albums.identified),
                    albumsTotal: number(state.albums.total),
                  })
                }}
              </p>
            </div>
            <UiPillButton variant="secondary" :disabled="blocked !== null" @click="configure(['artists', 'albums'])">{{
              t('state_identify')
            }}</UiPillButton>
          </div>
          <div :class="ROW" data-testid="state-covers">
            <div>
              <h2 class="m-0 text-callout font-semibold">{{ t('state_covers') }}</h2>
              <p class="m-0 text-footnote text-muted [font-variant-numeric:tabular-nums]">
                {{
                  t('state_covers_facts', {
                    embedded: number(state.albums.covers.embedded),
                    folder: number(state.albums.covers.folder),
                    none: number(state.albums.covers.none),
                  })
                }}<template v-if="state.albums.covers.unknown">
                  · {{ t('state_not_read', { count: number(state.albums.covers.unknown) }) }}</template
                >
              </p>
            </div>
            <UiPillButton
              variant="secondary"
              :disabled="blocked !== null || !taskAllowed('covers')"
              @click="configure(['albums', 'covers'])"
              >{{ t('state_find_covers') }}</UiPillButton
            >
          </div>
          <div :class="ROW" data-testid="state-images">
            <div>
              <h2 class="m-0 text-callout font-semibold">{{ t('state_images') }}</h2>
              <p class="m-0 text-footnote text-muted [font-variant-numeric:tabular-nums]">
                {{
                  t('state_images_facts', {
                    photo: number(state.artists.photo),
                    background: number(state.artists.background),
                    total: number(state.artists.total),
                  })
                }}
              </p>
            </div>
            <UiPillButton
              variant="secondary"
              :disabled="blocked !== null || !taskAllowed('images') || !roles.length"
              @click="configure(['artists', 'images'])"
              >{{ t('state_find_images') }}</UiPillButton
            >
          </div>
          <div :class="ROW" data-testid="state-lyrics">
            <div>
              <h2 class="m-0 text-callout font-semibold">{{ t('state_lyrics') }}</h2>
              <p class="m-0 text-footnote text-muted [font-variant-numeric:tabular-nums]">
                {{
                  state.lyrics.sidecar === null
                    ? t('state_lyrics_unwalked', { tracks: number(state.lyrics.tracks) })
                    : t('state_lyrics_facts', {
                        sidecar: number(state.lyrics.sidecar),
                        tracks: number(state.lyrics.tracks),
                      })
                }}
              </p>
            </div>
            <UiPillButton
              variant="secondary"
              :disabled="blocked !== null || !taskAllowed('lyrics')"
              @click="configure(['albums', 'lyrics'])"
              >{{ t('state_find_lyrics') }}</UiPillButton
            >
          </div>
          <div :class="ROW" data-testid="state-tags">
            <div>
              <h2 class="m-0 text-callout font-semibold">{{ t('state_tags') }}</h2>
              <p class="m-0 text-footnote text-muted [font-variant-numeric:tabular-nums]">
                {{
                  t('state_tags_facts', {
                    artist: number(state.tags.unknownArtist),
                    album: number(state.tags.unknownAlbum),
                    genre: number(state.tags.unknownGenre),
                  })
                }}<template v-if="state.albums.noYear !== null">
                  · {{ t('state_no_year', { count: number(state.albums.noYear) }) }}</template
                >
              </p>
            </div>
            <UiTextButton
              v-if="unknownTagged.length"
              :aria-expanded="lists.tags"
              data-testid="state-tags-list"
              @click="lists.tags = !lists.tags"
              >{{ t(lists.tags ? 'state_hide_list' : 'state_show_list') }}</UiTextButton
            >
            <ul
              v-if="lists.tags"
              class="col-span-full m-0 grid min-w-0 list-none gap-4 p-0 text-footnote text-secondary"
            >
              <li v-for="track in unknownTagged.slice(0, 50)" :key="track.id" class="truncate">
                {{ track.title }}<template v-if="track.path"> · {{ cardFolder(track.path) }}</template>
              </li>
            </ul>
          </div>
          <div :class="ROW" data-testid="state-duplicates">
            <div>
              <h2 class="m-0 text-callout font-semibold">{{ t('state_duplicates') }}</h2>
              <p class="m-0 text-footnote text-muted">
                {{ t('state_duplicates_facts', { count: number(duplicateRows.length) }) }}
              </p>
            </div>
            <UiTextButton v-if="duplicateRows.length" @click="$router.push('/card')">{{
              t('state_open_space')
            }}</UiTextButton>
          </div>
          <div :class="ROW" data-testid="state-unreadable">
            <div>
              <h2 class="m-0 text-callout font-semibold">{{ t('state_unreadable') }}</h2>
              <p class="m-0 text-footnote text-muted">
                {{ t('state_unreadable_facts', { count: number(unreadable.length) }) }}
              </p>
            </div>
            <UiTextButton
              v-if="unreadable.length"
              :aria-expanded="lists.unreadable"
              @click="lists.unreadable = !lists.unreadable"
              >{{ t(lists.unreadable ? 'state_hide_list' : 'state_show_list') }}</UiTextButton
            >
            <ul
              v-if="lists.unreadable"
              class="col-span-full m-0 grid min-w-0 list-none gap-4 p-0 text-footnote text-secondary"
            >
              <li v-for="path in unreadable.slice(0, 50)" :key="path" class="truncate">{{ cardFolder(path) }}</li>
            </ul>
          </div>
        </div>
        <div class="mt-20 flex flex-wrap items-center justify-end gap-x-16 gap-y-8">
          <p v-if="blocked" class="m-0 text-footnote text-muted" data-testid="state-blocked">{{ t(blocked) }}</p>
          <UiPillButton
            :disabled="blocked !== null"
            data-testid="state-enrich"
            @click="configure(['artists', 'albums', 'covers', 'images'])"
            >{{ t('state_enrich') }}</UiPillButton
          >
        </div>
      </template>

      <!-- The first step: what the run will do. -->
      <section v-else-if="libraryRun.phase === 'idle'" aria-labelledby="state-config" data-testid="state-config">
        <h2 id="state-config" class="mt-0 mb-14 text-title3 font-bold tracking-heading">
          {{ t('state_config_title') }}
        </h2>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-14">
          <div class="grid content-start gap-10 rounded-12 border border-line bg-raised px-16 py-14">
            <h3 class="m-0 text-callout font-semibold">{{ t('state_tasks') }}</h3>
            <label
              v-for="task in TASKS"
              :key="task"
              class="flex items-baseline gap-10 text-footnote text-ink has-disabled:text-muted"
            >
              <input
                type="checkbox"
                class="accent-progress-fill"
                :checked="tasks.includes(task)"
                :disabled="!taskAllowed(task) || (task === 'images' && !roles.length)"
                :data-testid="`state-task-${task}`"
                @change="toggleTask(task, ($event.target as HTMLInputElement).checked)"
              />
              <span
                >{{ t(`state_task_${task}`) }}
                <span class="text-muted [font-variant-numeric:tabular-nums]">{{ number(taskCount(task)) }}</span
                ><span v-if="!taskAllowed(task)" class="text-muted"> · {{ t('state_task_off') }}</span></span
              >
            </label>
          </div>
          <div class="grid content-start gap-10 rounded-12 border border-line bg-raised px-16 py-14">
            <h3 class="m-0 text-callout font-semibold">{{ t('state_how') }}</h3>
            <UiChips v-model="mode" :label="t('state_mode')" :options="modes" />
            <p class="m-0 text-caption leading-[1.5] text-muted">
              {{ t(mode === 'auto' ? 'state_mode_auto_note' : 'state_mode_manual_note') }}
            </p>
            <label class="flex flex-col gap-6 text-footnote text-muted">
              {{ t('state_scope') }}
              <UiSelect>
                <select
                  v-model="scope"
                  class="rounded-18 border border-line bg-raised px-14 py-7 text-footnote text-ink"
                  data-testid="state-scope"
                >
                  <option value="">{{ t('state_scope_all') }}</option>
                  <option v-for="artist in mainArtists" :key="artist.name" :value="artist.name">
                    {{ artist.name }}
                  </option>
                </select>
              </UiSelect>
            </label>
            <p class="m-0 text-caption leading-[1.5] text-muted" data-testid="state-estimate">
              {{ t('state_estimate', { requests: number(requests), minutes: number(minutes) }) }}
            </p>
            <p class="m-0 text-caption leading-[1.5] text-muted">{{ t('state_sends') }}</p>
          </div>
        </div>
        <div class="mt-18 flex justify-end gap-8">
          <UiPillButton variant="secondary" @click="configuring = false">{{ t('cancel') }}</UiPillButton>
          <UiPillButton :disabled="!tasks.length || !runReady()" data-testid="state-start" @click="start">{{
            t('state_start')
          }}</UiPillButton>
        </div>
      </section>

      <!-- The run under way, and the owner's steps. -->
      <section
        v-else-if="runActive && libraryRun.phase !== 'writing'"
        aria-labelledby="state-run"
        data-testid="state-run"
      >
        <span class="text-caption2 font-semibold tracking-caps text-muted uppercase">{{
          t(libraryRun.reviewing ? 'state_reviewing' : current?.kind === 'album' ? 'state_albums' : 'state_artists')
        }}</span>
        <h2 id="state-run" class="mt-6 mb-4 text-title2 font-bold tracking-heading" data-testid="state-current">
          {{ current ? (current.kind === 'artist' ? current.name : current.title) : t('state_preparing') }}
        </h2>
        <p class="m-0 text-footnote text-muted">
          <template v-if="current?.kind === 'album'">{{ current.artist }} · </template
          >{{ libraryRun.phase === 'paused' ? t('state_paused') : libraryRun.step ? t(STEPS[libraryRun.step]!) : '' }}
        </p>
        <div
          class="mt-14 h-8 overflow-hidden rounded-4 bg-soft"
          role="progressbar"
          :aria-valuenow="progress"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="t('state_progress', { done: number(libraryRun.index), total: number(libraryRun.total) })"
        >
          <i
            class="block h-full bg-progress-fill transition-[width] motion-reduce:transition-none"
            :style="{ width: `${progress}%` }"
          />
        </div>
        <p class="mt-6 mb-0 text-caption text-muted [font-variant-numeric:tabular-nums]">
          {{ t('state_progress', { done: number(libraryRun.index), total: number(libraryRun.total) }) }}
        </p>

        <div v-if="target" class="mt-18 rounded-12 border border-line bg-raised px-16 py-14" data-testid="state-ask">
          <h3 class="mt-0 mb-10 text-callout font-semibold">
            {{ t(target.kind === 'artist' ? 'state_ask_artist' : 'state_ask_album') }}
          </h3>
          <IdentifyChoices v-model="chosen" :target="target" />
          <div class="mt-14 flex justify-end gap-8">
            <UiPillButton variant="secondary" data-testid="state-skip" @click="skipChoice">{{
              t('state_skip')
            }}</UiPillButton>
            <UiPillButton
              :disabled="
                !chosen || identifying.saving || identifying.status !== 'ready' || identifying.view === 'groups'
              "
              data-testid="state-confirm"
              @click="confirm"
              >{{ t('state_confirm_next') }}</UiPillButton
            >
          </div>
        </div>

        <ul class="mt-18 mb-0 grid list-none gap-6 p-0 text-footnote" data-testid="state-log">
          <li
            v-for="(entry, index) in libraryRun.log"
            :key="index"
            class="grid grid-cols-[18px_minmax(0,1fr)_auto] items-baseline gap-8"
          >
            <span
              aria-hidden="true"
              class="font-bold"
              :class="entry.outcome === 'review' ? 'text-notice' : 'text-muted'"
              >{{ MARKS[entry.outcome] }}</span
            >
            <span class="truncate text-secondary"
              >{{ entry.label }}<template v-if="entry.detail"> · {{ entry.detail }}</template></span
            >
            <span class="text-caption text-muted">{{ t(OUTCOMES[entry.outcome]!) }}</span>
          </li>
        </ul>
        <div class="mt-18 flex flex-wrap items-center justify-end gap-8">
          <span v-if="libraryRun.counts.review" class="text-footnote text-muted" data-testid="state-review-count">{{
            t('state_review_count', { count: number(libraryRun.counts.review) })
          }}</span>
          <UiPillButton
            v-if="libraryRun.phase === 'paused'"
            variant="secondary"
            data-testid="state-continue"
            @click="continueRun"
            >{{ t('state_continue') }}</UiPillButton
          >
          <UiPillButton
            v-else
            variant="secondary"
            :disabled="libraryRun.phase === 'waiting'"
            data-testid="state-pause"
            @click="pauseRun"
            >{{ t('state_pause') }}</UiPillButton
          >
          <UiPillButton variant="secondary" data-testid="state-stop" @click="stopRun">{{
            t('state_stop')
          }}</UiPillButton>
        </div>
      </section>

      <!-- The report. -->
      <section v-else aria-labelledby="state-report" data-testid="state-report">
        <h2 id="state-report" class="mt-0 mb-14 text-title3 font-bold tracking-heading">{{ t('state_done_title') }}</h2>
        <p
          v-if="undone !== null"
          role="status"
          class="mt-0 mb-14 text-footnote text-secondary"
          data-testid="state-undone"
        >
          {{ t(undone ? 'state_undone' : 'state_undone_partly') }}
        </p>
        <div class="border-t border-line">
          <div :class="ROW">
            <div>
              <h3 class="m-0 text-callout font-semibold">{{ t('state_done_identified') }}</h3>
              <p class="m-0 text-footnote text-muted" data-testid="state-done-identified">
                {{
                  t('state_done_identified_facts', {
                    artists: number(libraryRun.counts.artists),
                    albums: number(libraryRun.counts.albums),
                    images: number(libraryRun.counts.images),
                  })
                }}
              </p>
            </div>
          </div>
          <div :class="ROW">
            <div>
              <h3 class="m-0 text-callout font-semibold">{{ t('state_done_review') }}</h3>
              <p class="m-0 text-footnote text-muted" data-testid="state-done-review">
                {{ t('state_done_review_facts', { count: number(libraryRun.review.length) }) }}
              </p>
            </div>
            <UiPillButton
              v-if="libraryRun.review.length"
              variant="secondary"
              :disabled="libraryRun.phase !== 'done'"
              data-testid="state-review"
              @click="reviewRun"
              >{{ t('state_review_go') }}</UiPillButton
            >
          </div>
          <div :class="ROW">
            <div>
              <h3 class="m-0 text-callout font-semibold">{{ t('state_done_missing') }}</h3>
              <p class="m-0 text-footnote text-muted" data-testid="state-done-missing">
                {{
                  t('state_done_missing_facts', {
                    missing: number(libraryRun.counts.missing),
                    skipped: number(libraryRun.counts.skipped),
                  })
                }}
              </p>
            </div>
          </div>
          <div :class="ROW" data-testid="state-files">
            <div>
              <h3 class="m-0 text-callout font-semibold">{{ t('state_done_files') }}</h3>
              <p class="m-0 text-footnote text-muted">
                {{
                  t('state_done_files_facts', {
                    covers: number(covers.length),
                    lyrics: number(lyrics.length),
                    written: number(written),
                  })
                }}
              </p>
            </div>
            <UiPillButton
              v-if="libraryRun.files.length"
              variant="secondary"
              :disabled="!waitingFiles || libraryRun.phase !== 'done'"
              data-testid="state-write"
              @click="writeFiles"
              >{{ t('state_files_write') }}</UiPillButton
            >
            <ul v-if="libraryRun.files.length" class="col-span-full m-0 grid min-w-0 list-none gap-6 p-0">
              <li v-for="file in libraryRun.files" :key="file.id" class="min-w-0">
                <label class="flex min-w-0 items-baseline gap-10 text-footnote text-ink has-disabled:text-muted">
                  <input
                    type="checkbox"
                    class="accent-progress-fill"
                    :checked="file.chosen"
                    :disabled="file.status !== 'new' || libraryRun.phase !== 'done'"
                    data-testid="state-file"
                    @change="chooseFile(file.id, ($event.target as HTMLInputElement).checked)"
                  />
                  <span class="min-w-0 truncate"
                    >{{ t(file.kind === 'cover' ? 'state_file_cover' : 'state_file_lyrics') }} · {{ file.label }}
                    <span class="text-muted">· {{ file.path }}</span></span
                  >
                  <span v-if="file.status !== 'new'" class="ml-auto shrink-0 text-caption text-muted">{{
                    t(FILE_STATUS[file.status]!)
                  }}</span>
                </label>
              </li>
            </ul>
          </div>
        </div>
        <div class="mt-18 flex flex-wrap justify-end gap-8">
          <UiPillButton
            variant="secondary"
            :disabled="libraryRun.phase !== 'done' || undone !== null"
            data-testid="state-undo"
            @click="undo"
            >{{ t('state_undo') }}</UiPillButton
          >
          <UiPillButton :disabled="libraryRun.phase !== 'done'" data-testid="state-close" @click="close">{{
            t('state_close')
          }}</UiPillButton>
        </div>
      </section>
    </div>
  </CollectionGate>
</template>
