<script setup lang="ts">
/**
 * An album's editions beside the album on the card (owner, 2026-10-08:
 * choosing an edition blind is hard). On the left what MusicBrainz proposes:
 * its editions and the chosen one's tracks, read when it is chosen; on the
 * right the album's tracks on the card. The two lists start on one line and
 * pair by row (`domain/tracklists.ts`); on narrow screens they stack.
 */
import { computed, watch } from 'vue'
import { albumTracks, byTrackNumber, discOf } from '../domain/album'
import { formatDuration } from '../domain/track'
import { compareTracklists, type ListedTrack } from '../domain/tracklists'
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

const HEADING = 'm-0 text-caption2 font-semibold tracking-caps text-muted uppercase'
const LINE = 'm-0 truncate text-caption text-muted [font-variant-numeric:tabular-nums]'
const ROW =
  'grid h-28 grid-cols-[2.4em_minmax(0,1fr)_auto] items-center gap-8 border-t border-line text-footnote first:border-t-0'
</script>

<template>
  <div class="grid grid-cols-2 gap-x-28 gap-y-10 sheet:grid-cols-1" data-testid="album-compare">
    <section
      class="row-span-3 grid min-w-0 grid-rows-subgrid"
      :aria-label="t('compare_proposed')"
      data-testid="compare-proposed"
    >
      <h3 :class="HEADING">{{ t('compare_proposed') }}</h3>
      <IdentifyChoices v-model="chosen" :target="target" compact />
      <div class="min-w-0">
        <p :class="LINE" role="status" data-testid="compare-proposed-line">
          {{ proposedLine
          }}<span v-if="differing" class="text-notice"> · {{ t('compare_differ', { count: differing }) }}</span>
        </p>
        <ol class="m-0 mt-6 list-none p-0" data-testid="compare-proposed-tracks">
          <li
            v-for="(row, index) in lists.proposed.rows"
            :key="index"
            :class="ROW"
            :data-differs="row.titleDiffers || row.lengthDiffers || undefined"
          >
            <span class="text-muted [font-variant-numeric:tabular-nums]">{{ row.label }}</span>
            <span class="truncate" :class="row.titleDiffers ? 'text-notice' : 'text-ink'" :title="row.title"
              >{{ row.title }}<span v-if="row.titleDiffers" class="sr-only">, {{ t('compare_differs') }}</span></span
            >
            <span
              class="text-caption [font-variant-numeric:tabular-nums]"
              :class="row.lengthDiffers ? 'text-notice' : 'text-muted'"
              >{{ formatDuration(row.lengthMs)
              }}<span v-if="row.lengthDiffers" class="sr-only">, {{ t('compare_length_differs') }}</span></span
            >
          </li>
        </ol>
      </div>
    </section>
    <section
      class="row-span-3 grid min-w-0 grid-rows-subgrid sheet:mt-14"
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
      <div class="min-w-0">
        <p :class="LINE">{{ summary(lists.current.rows.length, lists.current.lengthMs) }}</p>
        <ol class="m-0 mt-6 list-none p-0" data-testid="compare-current-tracks">
          <li
            v-for="(row, index) in lists.current.rows"
            :key="index"
            :class="ROW"
            :data-differs="row.titleDiffers || undefined"
          >
            <span class="text-muted [font-variant-numeric:tabular-nums]">{{ row.label }}</span>
            <span class="truncate" :class="row.titleDiffers ? 'text-notice' : 'text-ink'" :title="row.title"
              >{{ row.title }}<span v-if="row.titleDiffers" class="sr-only">, {{ t('compare_missing') }}</span></span
            >
            <span class="text-caption text-muted [font-variant-numeric:tabular-nums]">{{
              formatDuration(row.lengthMs)
            }}</span>
          </li>
        </ol>
      </div>
    </section>
  </div>
</template>
