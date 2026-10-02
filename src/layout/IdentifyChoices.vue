<script setup lang="ts">
/**
 * The MusicBrainz candidates for an artist, or an album's editions with the
 * artist's discography to browse (owner, 2026-10-02), as the identify window
 * and the library enrichment's manual steps show them. The search is the
 * caller's (it fills `identifying`); the choice is the model.
 */
import { computed } from 'vue'
import { regionName } from '../domain/artistFacts'
import type { ReleaseCandidate, ReleaseGroupCandidate } from '../gateway/musicbrainz'
import { locale, t, type MessageKey } from '../i18n'
import { findArtistAlbums, findGroupEditions, identifyBack, identifying } from '../stores/musicbrainzIds'
import UiIcon from '../ui/UiIcon.vue'
import UiTextButton from '../ui/UiTextButton.vue'
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
const editionLine = (
  release: Pick<ReleaseCandidate, 'disambiguation' | 'label' | 'catalogNumber' | 'country' | 'format' | 'date'>,
) =>
  [
    release.disambiguation,
    [release.label, release.catalogNumber].filter(Boolean).join(' '),
    release.country ? regionName(release.country, locale.value) : null,
    release.format,
    year(release.date),
  ]
    .filter(Boolean)
    .join(' · ')
/** The edition has as many tracks as the album on the card. */
const sameCount = (release: ReleaseCandidate) =>
  props.target.kind === 'album' && props.target.trackCount !== null && release.trackCount === props.target.trackCount

/** An album of the artist's discography: its year and types. */
const groupLine = (group: ReleaseGroupCandidate) =>
  [year(group.firstRelease), [group.type, ...group.secondaryTypes].filter(Boolean).join(' + ')]
    .filter(Boolean)
    .join(' · ')
function browseAlbums(): void {
  chosen.value = null
  const target = props.target
  if (target.kind === 'album') void findArtistAlbums(target.key, target.artist)
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
      role="group"
      :aria-label="target.kind === 'artist' ? target.name : target.title"
      class="grid gap-6"
      data-testid="identify-choices"
    >
      <template v-if="target.kind === 'artist'">
        <button
          v-for="candidate in identifying.artists"
          :key="candidate.id"
          type="button"
          :aria-pressed="candidate.id === chosen"
          class="rounded-10 border border-line px-14 py-10 text-left text-footnote text-secondary hover:bg-hover aria-pressed:border-accent aria-pressed:text-ink"
          @click="chosen = candidate.id"
        >
          <strong class="font-semibold text-ink">{{ candidate.name }}</strong
          ><template v-if="artistFactsLine(candidate)"> · {{ artistFactsLine(candidate) }}</template>
        </button>
      </template>
      <template v-else-if="identifying.view === 'groups'">
        <button
          v-for="group in identifying.groups"
          :key="group.id"
          type="button"
          class="rounded-10 border border-line px-14 py-10 text-left text-footnote text-secondary hover:bg-hover"
          data-testid="identify-group"
          @click="chooseGroup(group)"
        >
          <strong class="font-semibold text-ink">{{ group.title }}</strong
          ><template v-if="groupLine(group)"> · {{ groupLine(group) }}</template>
        </button>
      </template>
      <template v-else>
        <button
          v-for="release in identifying.editions"
          :key="release.id"
          type="button"
          :aria-pressed="release.id === chosen"
          class="rounded-10 border border-line px-14 py-10 text-left text-footnote text-secondary hover:bg-hover aria-pressed:border-accent aria-pressed:text-ink"
          @click="chosen = release.id"
        >
          <strong class="font-semibold text-ink">{{ release.title }}</strong
          ><template v-if="editionLine(release)"> · {{ editionLine(release) }}</template
          ><template v-if="release.trackCount !== null">
            ·
            <span
              class="whitespace-nowrap"
              :class="{ 'text-ink': sameCount(release) }"
              :title="sameCount(release) ? t('edition_tracks_match') : undefined"
              data-testid="edition-tracks"
              :data-match="sameCount(release) ? 'true' : undefined"
              >{{ t('track_count', { count: release.trackCount })
              }}<UiIcon v-if="sameCount(release)" name="check" class="ml-3 inline size-12 align-[-1px]" /><span
                v-if="sameCount(release)"
                class="sr-only"
                >, {{ t('edition_tracks_match') }}</span
              ></span
            ></template
          >
        </button>
      </template>
    </div>
    <div v-if="target.kind === 'album'" class="mt-12 flex flex-wrap gap-x-18 gap-y-6">
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
    </div>
  </div>
</template>
