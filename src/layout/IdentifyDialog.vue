<script setup lang="ts">
/**
 * Which MusicBrainz artist a name is, or which edition an album is (owner,
 * 2026-10-02: from the details sheet's table, in a window like the image
 * picker's). Opening it asks MusicBrainz (the name, or the title and artist,
 * leave the network); the listener picks one and confirms; the identity is
 * kept on the player when paired, else for the tab. An edition shows its
 * track count, marked when the album on the card has as many (2026-10-02).
 */
import { computed, ref, watch } from 'vue'
import { regionName } from '../domain/artistFacts'
import type { ReleaseCandidate } from '../gateway/musicbrainz'
import { locale, t, type MessageKey } from '../i18n'
import {
  albumIdentity,
  artistIdentity,
  chooseArtistCandidate,
  confirmEdition,
  findArtistCandidates,
  findEditions,
  forgetCandidates,
  identifying,
} from '../stores/musicbrainzIds'
import UiDialog from '../ui/UiDialog.vue'
import UiIcon from '../ui/UiIcon.vue'
import UiPillButton from '../ui/UiPillButton.vue'
import type { IdentifyTarget } from './identify'
import { artistFactsLine } from '../views/captions'

const props = defineProps<{ target: IdentifyTarget | null }>()
const emit = defineEmits<{ close: [] }>()
const chosen = ref<string | null>(null)

watch(
  () => props.target,
  (target) => {
    chosen.value = null
    if (!target) return
    if (target.kind === 'artist') {
      chosen.value = artistIdentity(target.name)?.mbid ?? null
      void findArtistCandidates(target.name)
    } else {
      chosen.value = albumIdentity(target.key)?.mbid ?? null
      void findEditions(target.key, target.title, target.artist, target.trackCount)
    }
  },
  { immediate: true },
)

const STATUS: Partial<Record<string, MessageKey>> = {
  searching: 'info_searching',
  missing: 'info_missing',
  failed: 'info_failed',
}
const status = computed(() => (props.target ? (STATUS[identifying.status] ?? null) : null))
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
  props.target?.kind === 'album' && props.target.trackCount !== null && release.trackCount === props.target.trackCount

async function confirm(): Promise<void> {
  const target = props.target
  if (!target || !chosen.value) return
  if (target.kind === 'artist') {
    const candidate = identifying.artists.find((item) => item.id === chosen.value)
    if (candidate) await chooseArtistCandidate(target.name, { ...candidate, aliases: [...candidate.aliases] })
  } else {
    const release = identifying.editions.find((item) => item.id === chosen.value)
    if (release) await confirmEdition(target.key, release)
  }
  emit('close')
}
function close(): void {
  forgetCandidates()
  emit('close')
}
</script>

<template>
  <UiDialog :open="target !== null" eyebrow="MusicBrainz" :close-label="t('close')" size="xl" @close="close">
    <template v-if="target">
      <h2 class="mt-18 mb-8 text-title2 font-bold tracking-heading">
        {{ target.kind === 'artist' ? target.name : target.title }}
      </h2>
      <p class="m-0 mb-14 text-footnote leading-[1.55] text-muted">
        {{ t(target.kind === 'artist' ? 'info_identify_sends' : 'info_edition_sends') }}
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
      <div class="mt-18 flex justify-end gap-8">
        <UiPillButton variant="secondary" @click="close">{{ t('cancel') }}</UiPillButton>
        <UiPillButton
          :disabled="!chosen || identifying.saving || identifying.status !== 'ready'"
          data-testid="identify-confirm"
          @click="confirm"
          >{{ t('info_confirm') }}</UiPillButton
        >
      </div>
    </template>
  </UiDialog>
</template>
