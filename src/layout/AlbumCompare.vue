<script setup lang="ts">
/**
 * An album's editions beside the album on the card (owner, 2026-10-08:
 * choosing an edition blind is hard). On the left what MusicBrainz proposes:
 * its editions and the chosen one's tracks, read when it is chosen; on the
 * right the album's tracks on the card. The two lists start on one line and
 * pair by row (`domain/tracklists.ts`); on narrow screens they stack. Both
 * scroll together in a few rows' height (owner, 2026-10-20: a thirty-track
 * album ran off the screen), with a disc's heading staying in view while
 * its tracks pass, where a list spans several discs.
 */
import { computed, watch } from 'vue'
import { albumTracks, byTrackNumber, discOf } from '../domain/album'
import { formatDuration } from '../domain/track'
import { compareTracklists, type ComparedTrack, type ListedTrack } from '../domain/tracklists'
import { t, type MessageKey } from '../i18n'
import { tracks } from '../stores/library'
import { editionTracks, identifying, showEditionTracks } from '../stores/musicbrainzIds'
import IdentifyChoices from './IdentifyChoices.vue'
import type { IdentifyTarget } from './identify'

const props = defineProps<{ target: Extract<IdentifyTarget, { kind: 'album' }> }>()
const chosen = defineModel<string | null>({ required: true })

const onCard = computed(() => byTrackNumber(albumTracks(tracks.value, props.target.title, props.target.scope)))
const current = computed<ListedTrack[]>(() =>
  onCard.value.map((track) => ({
    disc: discOf(track),
    number: track.trackNumber && track.trackNumber > 0 ? String(track.trackNumber) : null,
    title: track.title,
    lengthMs: track.durationMs,
  })),
)
const cardFolder = (path: string) => path.replace(/^\/tmp\/sdcard\/?/, '').replace(/\/[^/]*$/, '')
const folders = computed(() => [
  ...new Set(onCard.value.flatMap((track) => (track.path ? [cardFolder(track.path)] : []))),
])

/** The chosen edition, while editions show (not the artist's albums). */
const edition = computed(() =>
  identifying.view === 'groups' ? null : (identifying.editions.find((item) => item.id === chosen.value) ?? null),
)
watch(
  () => edition.value?.id,
  (id) => {
    if (id) void showEditionTracks(id)
  },
  { immediate: true },
)
const read = computed(() => (edition.value ? (editionTracks.get(edition.value.id) ?? null) : null))
const lists = computed(() => compareTracklists(read.value?.status === 'ready' ? read.value.tracks : [], current.value))
const differing = computed(
  () => lists.value.proposed.rows.filter((row) => row.titleDiffers || row.lengthDiffers).length,
)

const READING: Record<'searching' | 'missing' | 'failed', MessageKey> = {
  searching: 'compare_reading',
  missing: 'compare_no_tracks',
  failed: 'compare_failed',
}
/** The proposed list's first line: its count and length, or why it shows none. */
const proposedLine = computed(() => {
  if (!edition.value) return t('compare_choose')
  const status = read.value?.status ?? 'searching'
  if (status !== 'ready') return t(READING[status])
  return summary(lists.value.proposed.rows.length, lists.value.proposed.lengthMs)
})
const summary = (count: number, lengthMs: number | null) =>
  [t('track_count', { count }), formatDuration(lengthMs)].filter(Boolean).join(' · ')

/** The list's rows with a heading before each disc, where it spans several. */
type ListRow = { kind: 'disc'; disc: number } | { kind: 'track'; row: ComparedTrack }
function withDiscs(rows: readonly ComparedTrack[]): ListRow[] {
  const discs = new Set(rows.map((row) => row.disc ?? 1))
  if (discs.size < 2) return rows.map((row) => ({ kind: 'track', row }))
  const out: ListRow[] = []
  let last: number | null = null
  for (const row of rows) {
    const disc = row.disc ?? 1
    if (disc !== last) out.push({ kind: 'disc', disc })
    last = disc
    out.push({ kind: 'track', row })
  }
  return out
}
const proposedRows = computed(() => withDiscs(lists.value.proposed.rows))
const currentRows = computed(() => withDiscs(lists.value.current.rows))

const HEADING = 'm-0 text-caption2 font-semibold tracking-caps text-muted uppercase'
const DISC =
  'sticky top-0 z-10 flex h-24 items-center bg-paper text-caption2 font-semibold tracking-caps text-muted uppercase'
const LINE = 'm-0 truncate text-caption text-muted [font-variant-numeric:tabular-nums]'
const ROW =
  'grid h-28 grid-cols-[2.4em_minmax(0,1fr)_auto] items-center gap-8 border-t border-line text-footnote first:border-t-0'
</script>

<template>
  <div class="grid grid-cols-2 gap-x-28 gap-y-10 sheet:grid-cols-1" data-testid="album-compare">
    <section
      class="row-span-2 grid min-w-0 grid-rows-subgrid"
      :aria-label="t('compare_proposed')"
      data-testid="compare-proposed"
    >
      <h3 :class="HEADING">{{ t('compare_proposed') }}</h3>
      <IdentifyChoices v-model="chosen" :target="target" compact />
    </section>
    <section
      class="row-span-2 grid min-w-0 grid-rows-subgrid sheet:mt-14"
      :aria-label="t('compare_current')"
      data-testid="compare-current"
    >
      <h3 :class="HEADING">{{ t('compare_current') }}</h3>
      <div class="grid min-w-0 content-start gap-2 text-footnote">
        <strong class="truncate font-semibold text-ink">{{ target.title }}</strong>
        <span class="truncate text-secondary">{{ target.artist }}</span>
        <span v-for="folder in folders.slice(0, 3)" :key="folder" class="truncate text-muted" :title="folder">{{
          folder
        }}</span>
      </div>
    </section>
    <div
      class="col-span-2 grid max-h-[min(400px,45dvh)] grid-cols-2 gap-x-28 overflow-y-auto overscroll-contain sheet:col-span-1 sheet:grid-cols-1 sheet:gap-y-14"
      data-testid="compare-tracks"
    >
      <div class="min-w-0">
        <p :class="LINE" role="status" data-testid="compare-proposed-line">
          {{ proposedLine
          }}<span v-if="differing" class="text-notice"> · {{ t('compare_differ', { count: differing }) }}</span>
        </p>
        <ol class="m-0 mt-6 list-none p-0" data-testid="compare-proposed-tracks">
          <template v-for="(item, index) in proposedRows" :key="index">
            <li v-if="item.kind === 'disc'" role="presentation" :class="DISC">
              {{ t('disc_number', { number: item.disc }) }}
            </li>
            <li v-else :class="ROW" :data-differs="item.row.titleDiffers || item.row.lengthDiffers || undefined">
              <span class="text-muted [font-variant-numeric:tabular-nums]">{{ item.row.label }}</span>
              <span class="truncate" :class="item.row.titleDiffers ? 'text-notice' : 'text-ink'" :title="item.row.title"
                >{{ item.row.title
                }}<span v-if="item.row.titleDiffers" class="sr-only">, {{ t('compare_differs') }}</span></span
              >
              <span
                class="text-caption [font-variant-numeric:tabular-nums]"
                :class="item.row.lengthDiffers ? 'text-notice' : 'text-muted'"
                >{{ formatDuration(item.row.lengthMs)
                }}<span v-if="item.row.lengthDiffers" class="sr-only">, {{ t('compare_length_differs') }}</span></span
              >
            </li>
          </template>
        </ol>
      </div>
      <div class="min-w-0">
        <p :class="LINE">{{ summary(lists.current.rows.length, lists.current.lengthMs) }}</p>
        <ol class="m-0 mt-6 list-none p-0" data-testid="compare-current-tracks">
          <template v-for="(item, index) in currentRows" :key="index">
            <li v-if="item.kind === 'disc'" role="presentation" :class="DISC">
              {{ t('disc_number', { number: item.disc }) }}
            </li>
            <li v-else :class="ROW" :data-differs="item.row.titleDiffers || undefined">
              <span class="text-muted [font-variant-numeric:tabular-nums]">{{ item.row.label }}</span>
              <span class="truncate" :class="item.row.titleDiffers ? 'text-notice' : 'text-ink'" :title="item.row.title"
                >{{ item.row.title
                }}<span v-if="item.row.titleDiffers" class="sr-only">, {{ t('compare_missing') }}</span></span
              >
              <span class="text-caption text-muted [font-variant-numeric:tabular-nums]">{{
                formatDuration(item.row.lengthMs)
              }}</span>
            </li>
          </template>
        </ol>
      </div>
    </div>
  </div>
</template>
