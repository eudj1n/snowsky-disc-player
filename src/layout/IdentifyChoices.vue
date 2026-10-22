<script setup lang="ts">
/**
 * The MusicBrainz candidates for an artist, or an album's editions with the
 * artist's discography to browse (owner, 2026-10-02), as the identify window
 * and the library enrichment's manual steps show them. The search is the
 * caller's (it fills `identifying`); the choice is the model.
 *
 * Editions pass one at a time (owner, 2026-10-22): one card in three lines,
 * the title, the issue and the track count, with arrows to the previous and
 * the next, so the full edition shows where a row of them had to be cut
 * short. The card's edition is the choice, so its tracks are read as the
 * cards pass. Candidates and the artist's albums stay lists, in a frame of
 * a few rows' height, so many of them never stretch the window. Under all
 * of it the listener can search by another name (a tag spelled wrong on the
 * card), opened by itself when the name found nothing.
 */
import { computed, ref, watch } from 'vue'
import { regionName } from '../domain/artistFacts'
import type { ReleaseCandidate, ReleaseGroupCandidate } from '../gateway/musicbrainz'
import { locale, t, type MessageKey } from '../i18n'
import {
  findArtistAlbums,
  findArtistCandidates,
  findEditions,
  findGroupEditions,
  identifyBack,
  identifying,
} from '../stores/musicbrainzIds'
import UiIcon from '../ui/UiIcon.vue'
import UiCircleButton from '../ui/UiCircleButton.vue'
import UiPillButton from '../ui/UiPillButton.vue'
import UiTextButton from '../ui/UiTextButton.vue'
import UiTextField from '../ui/UiTextField.vue'
import type { IdentifyTarget } from './identify'
import { artistFactsLine } from '../views/captions'

const props = defineProps<{ target: IdentifyTarget }>()
const chosen = defineModel<string | null>({ required: true })

const STATUS: Partial<Record<string, MessageKey>> = {
  searching: 'info_searching',
  missing: 'info_missing',
  failed: 'info_failed',
}
const status = computed(() => STATUS[identifying.status] ?? null)
const year = (date: string | null) => (date && /^\d{4}/.test(date) ? date.slice(0, 4) : null)
/** The edition's issue: its label and catalog number, country, format and year. */
const issueLine = (
  release: Pick<ReleaseCandidate, 'label' | 'catalogNumber' | 'country' | 'format' | 'date'>,
): string | null =>
  [
    [release.label, release.catalogNumber].filter(Boolean).join(' '),
    release.country ? regionName(release.country, locale.value) : null,
    release.format,
    year(release.date),
  ]
    .filter(Boolean)
    .join(' · ') || null
/** The edition's title with what tells it apart ("remaster", "Dolby Atmos mix"). */
const titleLine = (release: Pick<ReleaseCandidate, 'title' | 'disambiguation'>): string =>
  [release.title, release.disambiguation].filter(Boolean).join(' · ')
/** The edition has as many tracks as the album on the card. */
const sameCount = (release: ReleaseCandidate) =>
  props.target.kind === 'album' && props.target.trackCount !== null && release.trackCount === props.target.trackCount

/* The editions, one at a time: the card's edition is the choice. */
const index = computed(() => identifying.editions.findIndex((release) => release.id === chosen.value))
const edition = computed(() => (index.value >= 0 ? identifying.editions[index.value] : null))
watch(
  () => [identifying.editions, identifying.view] as const,
  ([editions, view]) => {
    if (view === 'groups' || !editions.length) return
    if (!editions.some((release) => release.id === chosen.value)) chosen.value = editions[0]?.id ?? null
  },
  { immediate: true },
)
function step(by: -1 | 1): void {
  const next = identifying.editions[index.value + by]
  if (next) chosen.value = next.id
}

/** An album of the artist's discography: its year and types. */
const groupLine = (group: ReleaseGroupCandidate) =>
  [year(group.firstRelease), [group.type, ...group.secondaryTypes].filter(Boolean).join(' + ')]
    .filter(Boolean)
    .join(' · ')
function browseAlbums(): void {
  chosen.value = null
  const target = props.target
  if (target.kind === 'album') void findArtistAlbums(target.key, queryArtist.value.trim() || target.artist)
}
function chooseGroup(group: ReleaseGroupCandidate): void {
  chosen.value = null
  const target = props.target
  if (target.kind === 'album') void findGroupEditions(target.key, group, target.title, target.trackCount)
}
function back(): void {
  chosen.value = null
  identifyBack()
}

/* A search by another name. */
const manual = ref(false)
const queryName = ref('')
const queryArtist = ref('')
watch(
  () => props.target,
  (target) => {
    manual.value = false
    queryName.value = target.kind === 'artist' ? target.name : target.title
    queryArtist.value = target.kind === 'album' ? target.artist : ''
  },
  { immediate: true },
)
watch(
  () => identifying.status,
  (value) => {
    if (value === 'missing') manual.value = true
  },
  { immediate: true },
)
const canSearch = computed(
  () =>
    identifying.status !== 'searching' &&
    queryName.value.trim() !== '' &&
    (props.target.kind === 'artist' || queryArtist.value.trim() !== ''),
)
function searchOtherwise(): void {
  if (!canSearch.value) return
  chosen.value = null
  const target = props.target
  if (target.kind === 'artist') void findArtistCandidates(target.name, queryName.value.trim())
  else void findEditions(target.key, queryName.value.trim(), queryArtist.value.trim(), target.trackCount)
}

const LIST = 'grid max-h-[min(268px,36dvh)] gap-4 overflow-y-auto overscroll-contain pr-4'
const CHOICE =
  'rounded-10 border border-line px-14 py-10 text-left text-footnote text-secondary hover:bg-hover aria-pressed:border-accent aria-pressed:text-ink'
</script>

<template>
  <div>
    <p
      v-if="target.kind === 'album' && identifying.view !== 'search'"
      class="m-0 mb-10 text-callout font-semibold"
      data-testid="identify-view"
    >
      {{
        identifying.view === 'groups'
          ? t('identify_groups_title', { name: target.artist })
          : t('identify_group_title', { title: identifying.group?.title ?? '' })
      }}
    </p>
    <p v-if="status" role="status" class="m-0 mb-14 text-footnote text-secondary" data-testid="identify-status">
      {{ t(status) }}
    </p>
    <div
      v-if="target.kind === 'artist'"
      role="group"
      :aria-label="target.name"
      :class="LIST"
      data-testid="identify-choices"
    >
      <button
        v-for="candidate in identifying.artists"
        :key="candidate.id"
        type="button"
        :aria-pressed="candidate.id === chosen"
        :class="CHOICE"
        @click="chosen = candidate.id"
      >
        <strong class="font-semibold text-ink">{{ candidate.name }}</strong
        ><template v-if="artistFactsLine(candidate)"> · {{ artistFactsLine(candidate) }}</template>
      </button>
    </div>
    <div
      v-else-if="identifying.view === 'groups'"
      role="group"
      :aria-label="target.title"
      :class="LIST"
      data-testid="identify-choices"
    >
      <button
        v-for="group in identifying.groups"
        :key="group.id"
        type="button"
        :class="CHOICE"
        data-testid="identify-group"
        @click="chooseGroup(group)"
      >
        <strong class="font-semibold text-ink">{{ group.title }}</strong
        ><template v-if="groupLine(group)"> · {{ groupLine(group) }}</template>
      </button>
    </div>
    <div
      v-else-if="edition"
      role="group"
      :aria-label="target.title"
      class="mt-8 flex items-center gap-10"
      data-testid="identify-choices"
      @keydown.left.prevent="step(-1)"
      @keydown.right.prevent="step(1)"
    >
      <UiCircleButton
        icon="chevron"
        :label="t('identify_previous')"
        :disabled="index <= 0"
        class="[&>svg]:rotate-90"
        data-testid="identify-previous"
        @click="step(-1)"
      />
      <div
        class="grid min-w-0 flex-1 gap-2 rounded-10 border border-accent px-14 py-10 text-footnote text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        tabindex="0"
        aria-live="polite"
        data-testid="identify-edition"
      >
        <strong class="font-semibold text-ink">{{ titleLine(edition) }}</strong>
        <span v-if="issueLine(edition)">{{ issueLine(edition) }}</span>
        <span
          v-if="edition.trackCount !== null"
          class="whitespace-nowrap"
          :class="{ 'text-ink': sameCount(edition) }"
          :title="sameCount(edition) ? t('edition_tracks_match') : undefined"
          data-testid="edition-tracks"
          :data-match="sameCount(edition) ? 'true' : undefined"
          >{{ t('track_count', { count: edition.trackCount })
          }}<UiIcon v-if="sameCount(edition)" name="check" class="ml-3 inline size-12 align-[-1px]" /><span
            v-if="sameCount(edition)"
            class="sr-only"
            >, {{ t('edition_tracks_match') }}</span
          ></span
        >
        <span class="text-caption text-muted [font-variant-numeric:tabular-nums]" data-testid="identify-position">{{
          t('identify_position', { index: index + 1, count: identifying.editions.length })
        }}</span>
      </div>
      <UiCircleButton
        icon="chevron"
        :label="t('identify_next')"
        :disabled="index >= identifying.editions.length - 1"
        class="[&>svg]:-rotate-90"
        data-testid="identify-next"
        @click="step(1)"
      />
    </div>
    <div class="mt-12 flex flex-wrap gap-x-18 gap-y-6">
      <template v-if="target.kind === 'album'">
        <UiTextButton
          v-if="identifying.view !== 'search'"
          :disabled="identifying.status === 'searching'"
          data-testid="identify-back"
          @click="back"
          >{{ t(identifying.view === 'group' ? 'identify_back_groups' : 'identify_back_search') }}</UiTextButton
        >
        <UiTextButton
          v-else
          :disabled="identifying.status === 'searching'"
          data-testid="identify-discography"
          @click="browseAlbums"
          >{{ t('identify_discography') }}</UiTextButton
        >
      </template>
      <UiTextButton v-if="!manual" data-testid="identify-search-other" @click="manual = true">{{
        t('identify_search_other')
      }}</UiTextButton>
    </div>
    <form
      v-if="manual"
      class="mt-10 flex flex-wrap items-center gap-8"
      data-testid="identify-search"
      @submit.prevent="searchOtherwise"
    >
      <div class="min-w-160 flex-1">
        <UiTextField
          v-model="queryName"
          variant="pill"
          :label="t(target.kind === 'artist' ? 'identify_query_name' : 'identify_query_title')"
          data-testid="identify-query"
        />
      </div>
      <div v-if="target.kind === 'album'" class="min-w-140 flex-1">
        <UiTextField
          v-model="queryArtist"
          variant="pill"
          :label="t('identify_query_artist')"
          data-testid="identify-query-artist"
        />
      </div>
      <UiPillButton variant="secondary" type="submit" :disabled="!canSearch" data-testid="identify-search-go">{{
        t('identify_search')
      }}</UiPillButton>
    </form>
  </div>
</template>
