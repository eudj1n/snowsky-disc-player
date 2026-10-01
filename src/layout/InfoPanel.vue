<script setup lang="ts">
/**
 * The details (i) of an artist or album in the listening panel (owner,
 * 2026-10-01, after the specimen): what MusicBrainz identifies ("Refine…"
 * among the candidates or editions, nothing asked until the listener
 * presses), the images with their source and licence (the artist's photo and
 * background, the album's cover and where it lies on the card), the links,
 * and later the files' tags. Laid out as the track panel; its credits used to
 * sit under the page's heading.
 */
import { computed, ref, watch } from 'vue'
import CoverCanvas from '../components/artwork/CoverCanvas.vue'
import { regionName } from '../domain/artistFacts'
import type { ArtistCandidate, ReleaseCandidate } from '../gateway/musicbrainz'
import { locale, t, type MessageKey } from '../i18n'
import {
  artistBackground,
  artistImage,
  artistImagesAllowed,
  artistPictures,
  chosenImage,
  forgetArtistImage,
  openArtistImages,
  type ImageRole,
} from '../stores/artistPictures'
import {
  albumIdentityKey,
  coverLookupAllowed,
  coverOnCard,
  openCoverPicker,
  type CoverOnCard,
} from '../stores/coverSearch'
import { albumCover, albumCoverState } from '../stores/enrichment'
import { albumTracks } from '../domain/album'
import { titleGroups, tracks } from '../stores/library'
import {
  albumIdentity,
  artistIdentity,
  chooseArtistCandidate,
  confirmEdition,
  findArtistCandidates,
  findEditions,
  forgetCandidates,
  identifyAllowed,
  identifying,
} from '../stores/musicbrainzIds'
import { ui } from '../stores/ui'
import UiPillButton from '../ui/UiPillButton.vue'
import UiTextButton from '../ui/UiTextButton.vue'
import { artistFactsLine } from '../views/captions'

const emit = defineEmits<{ navigate: [] }>()

const info = computed(() => ui.panelInfo)
const artistName = computed(() => (info.value?.kind === 'artist' ? info.value.name : null))
const album = computed(() => {
  const value = info.value
  return value?.kind === 'album' ? (titleGroups.value.find((item) => item.key === value.key) ?? null) : null
})
const scope = computed(() => (info.value?.kind === 'album' ? info.value.scope : null))
const albumKey = computed(() => (album.value ? albumIdentityKey(album.value, scope.value) : null))

/* MusicBrainz. */
const artistId = computed(() => (artistName.value ? artistIdentity(artistName.value) : null))
const edition = computed(() => (albumKey.value ? albumIdentity(albumKey.value) : null))
const searchKey = computed(() => artistName.value ?? albumKey.value)
const searching = computed(() => identifying.key !== null && identifying.key === searchKey.value)
watch(searchKey, () => forgetCandidates())
const SEARCH: Partial<Record<string, MessageKey>> = {
  searching: 'info_searching',
  missing: 'info_missing',
  failed: 'info_failed',
}
const searchMessage = computed(() => (searching.value ? (SEARCH[identifying.status] ?? null) : null))

function identify(): void {
  if (artistName.value) void findArtistCandidates(artistName.value)
  else if (album.value && albumKey.value) {
    const artist = scope.value ?? album.value.artists[0]
    if (!artist) return
    const count = albumTracks(tracks.value, album.value.title, scope.value).length
    void findEditions(albumKey.value, album.value.title, artist, count || null)
  }
}
/** A candidate from the read-only search, as a plain one (its aliases copied). */
const chooseArtist = (candidate: Omit<ArtistCandidate, 'aliases'> & { aliases: readonly string[] }) =>
  artistName.value && chooseArtistCandidate(artistName.value, { ...candidate, aliases: [...candidate.aliases] })
const chooseEdition = (release: ReleaseCandidate) => albumKey.value && confirmEdition(albumKey.value, release)

const year = (date: string | null | undefined) => (date && /^\d{4}/.test(date) ? date.slice(0, 4) : null)
const editionLine = (release: {
  label: string | null
  catalogNumber: string | null
  country: string | null
  format: string | null
  date: string | null
}) =>
  [
    [release.label, release.catalogNumber].filter(Boolean).join(' '),
    release.country ? regionName(release.country, locale.value) : null,
    release.format,
    year(release.date),
  ]
    .filter(Boolean)
    .join(' · ')
const firstRelease = computed(() => {
  const facts = edition.value?.facts
  if (!facts) return null
  const parts = [year(facts.firstRelease), facts.type, ...(facts.secondaryTypes ?? [])].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
})

/* Images. */
const SOURCE_NAMES = { wikimedia: 'Wikimedia Commons', fanarttv: 'fanart.tv' } as const
function credit(role: ImageRole) {
  const name = artistName.value
  if (!name) return null
  const chosen = chosenImage(name, role)
  if (chosen) return { ...chosen.image, source: SOURCE_NAMES[chosen.image.source], kept: chosen.kept }
  const legacy = role === 'photo' ? artistPictures.pictures[name] : undefined
  return legacy ? { ...legacy, source: SOURCE_NAMES.wikimedia, kept: 'browser' as const } : null
}
const photo = computed(() => (artistName.value ? artistImage(artistName.value) : null))
const background = computed(() => (artistName.value ? artistBackground(artistName.value) : null))
const cover = computed(() => (album.value ? albumCover(album.value, scope.value) : null))

/* Where the album's cover lies on the card, read when the panel shows the album. */
const onCard = ref<CoverOnCard | null>(null)
watch(
  () => [album.value?.key, scope.value, album.value ? albumCoverState(album.value, scope.value) : null] as const,
  async () => {
    onCard.value = null
    const value = album.value
    if (!value) return
    const read = await coverOnCard(value, scope.value)
    if (album.value === value) onCard.value = read
  },
  { immediate: true },
)
const coverWhere = computed<string>(() => {
  const value = onCard.value
  if (!value) return t('info_cover_reading')
  if (value.kind === 'folder') return t('info_cover_folder', { name: value.name })
  if (value.kind === 'embedded') return t('info_cover_embedded')
  if (value.kind === 'none') return t('info_cover_none')
  return t('info_cover_unknown')
})
const coverChoosable = computed(() => coverLookupAllowed() && onCard.value !== null && onCard.value.kind !== 'embedded')
const LINK = 'text-secondary underline-offset-3 hover:text-ink hover:underline'
</script>

<template>
  <div
    v-if="info"
    class="min-h-0 flex-1 [scrollbar-width:thin] overflow-auto overscroll-contain px-24 pb-28"
    data-testid="info-panel"
  >
    <span class="block text-caption2 font-semibold tracking-caps text-muted uppercase">{{ t('info_eyebrow') }}</span>
    <h2 class="mt-6 mb-4 text-title2 font-bold tracking-heading" data-testid="info-title">
      {{ artistName ?? album?.title }}
    </h2>
    <p class="m-0 text-footnote text-muted">
      {{ artistName ? t('kind_artist') : `${t('kind_album')} · ${scope ?? album?.artists[0] ?? ''}` }}
    </p>

    <section class="mt-24" aria-labelledby="info-musicbrainz" data-testid="info-musicbrainz">
      <h3 id="info-musicbrainz" class="mt-0 mb-10 text-title3 font-bold tracking-heading">MusicBrainz</h3>
      <div class="grid gap-6 rounded-12 border border-line bg-paper px-14 py-12 text-footnote leading-[1.5]">
        <template v-if="artistName && artistId">
          <p class="m-0 text-secondary">
            <strong class="font-semibold text-ink">{{ artistId.facts?.name ?? artistName }}</strong
            ><template v-if="artistId.facts && artistFactsLine(artistId.facts)">
              · {{ artistFactsLine(artistId.facts) }}</template
            >
          </p>
          <p class="m-0 text-caption text-muted">{{ t(artistId.kept ? 'info_kept_player' : 'info_kept_tab') }}</p>
        </template>
        <template v-else-if="album && edition">
          <p class="m-0 text-secondary">
            <strong class="font-semibold text-ink">{{ edition.facts?.title ?? album.title }}</strong
            ><template v-if="edition.facts && editionLine(edition.facts)"> · {{ editionLine(edition.facts) }}</template>
          </p>
          <p v-if="firstRelease" class="m-0 text-secondary">{{ t('info_first_release', { facts: firstRelease }) }}</p>
          <p class="m-0 text-caption text-muted">
            <template v-if="edition.facts?.barcode"
              >{{ t('info_barcode', { code: edition.facts.barcode }) }} · </template
            >{{ t(edition.kept ? 'info_kept_player' : 'info_kept_tab') }}
          </p>
        </template>
        <template v-else-if="identifyAllowed()">
          <p class="m-0 font-semibold text-ink">{{ t(artistName ? 'info_not_identified' : 'info_no_edition') }}</p>
          <p class="m-0 text-caption text-muted">{{ t(artistName ? 'info_identify_sends' : 'info_edition_sends') }}</p>
        </template>
        <template v-else>
          <p class="m-0 font-semibold text-ink">{{ t('info_musicbrainz_off') }}</p>
          <p class="m-0 text-secondary">{{ t('info_musicbrainz_off_note') }}</p>
        </template>
        <div class="flex flex-wrap items-center gap-x-14 gap-y-8">
          <template v-if="identifyAllowed()">
            <UiTextButton
              v-if="artistId || edition"
              :disabled="identifying.saving"
              data-testid="info-refine"
              @click="identify"
              >{{ t(artistName ? 'info_refine' : 'info_other_edition') }}</UiTextButton
            >
            <UiPillButton
              v-else
              variant="secondary"
              :disabled="identifying.saving || identifying.status === 'searching'"
              data-testid="info-identify"
              @click="identify"
              >{{ t(artistName ? 'info_identify' : 'info_choose_edition') }}</UiPillButton
            >
          </template>
          <RouterLink
            v-else
            class="text-footnote text-secondary underline underline-offset-2 hover:text-ink"
            :to="{ path: '/settings', query: { part: 'sources' } }"
            @click="emit('navigate')"
            >{{ t('external_sources') }}</RouterLink
          >
        </div>
        <p v-if="searchMessage" role="status" class="m-0 text-secondary" data-testid="info-status">
          {{ t(searchMessage) }}
        </p>
        <div v-if="searching && identifying.status === 'ready'" class="grid gap-6" data-testid="info-candidates">
          <template v-if="artistName">
            <button
              v-for="candidate in identifying.artists"
              :key="candidate.id"
              type="button"
              :aria-pressed="candidate.id === artistId?.mbid"
              :disabled="identifying.saving"
              class="rounded-10 border border-line bg-raised px-12 py-9 text-left text-secondary hover:bg-hover aria-pressed:border-accent aria-pressed:text-ink"
              @click="chooseArtist(candidate)"
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
              :aria-pressed="release.id === edition?.mbid"
              :disabled="identifying.saving"
              class="rounded-10 border border-line bg-raised px-12 py-9 text-left text-secondary hover:bg-hover aria-pressed:border-accent aria-pressed:text-ink"
              @click="chooseEdition(release)"
            >
              <strong class="font-semibold text-ink">{{ release.title }}</strong
              ><template v-if="editionLine(release)"> · {{ editionLine(release) }}</template>
            </button>
          </template>
        </div>
      </div>
    </section>

    <section class="mt-24" aria-labelledby="info-images" data-testid="info-images">
      <h3 id="info-images" class="mt-0 mb-10 text-title3 font-bold tracking-heading">
        {{ t(artistName ? 'info_images' : 'info_cover') }}
      </h3>
      <template v-if="artistName">
        <div
          v-for="role in ['photo', 'background'] as const"
          :key="role"
          class="grid grid-cols-[auto_1fr] items-center gap-12 border-t border-line py-10 first-of-type:border-t-0 first-of-type:pt-0"
          :data-testid="`info-${role}`"
        >
          <span
            class="block overflow-hidden bg-soft"
            :class="role === 'photo' ? 'size-56 rounded-full' : 'h-54 w-96 rounded-10'"
          >
            <CoverCanvas
              v-if="role === 'photo' ? photo : background"
              :blob="(role === 'photo' ? photo : background)!"
            />
          </span>
          <div class="min-w-0 text-footnote leading-[1.45]">
            <p class="m-0 font-semibold text-ink">{{ t(role === 'photo' ? 'images_photo' : 'images_background') }}</p>
            <p v-if="credit(role)" class="m-0 text-secondary">
              <a
                v-if="credit(role)?.page"
                :href="credit(role)?.page ?? ''"
                target="_blank"
                rel="noopener noreferrer"
                :class="LINK"
                >{{ credit(role)?.author ?? credit(role)?.source }}</a
              ><template v-else>{{ credit(role)?.author ?? credit(role)?.source }}</template
              ><template v-if="credit(role)?.license">
                ·
                <a
                  v-if="credit(role)?.licenseUrl"
                  :href="credit(role)?.licenseUrl ?? ''"
                  target="_blank"
                  rel="noopener noreferrer"
                  :class="LINK"
                  >{{ credit(role)?.license }}</a
                ><template v-else>{{ credit(role)?.license }}</template></template
              ><template v-if="credit(role)?.author"> · {{ credit(role)?.source }}</template> ·
              {{ t(credit(role)?.kept === 'player' ? 'image_kept_player' : 'photo_kept') }}
            </p>
            <p v-else class="m-0 text-muted">
              {{ t(role === 'photo' ? 'info_photo_stand_in' : 'info_background_none') }}
            </p>
            <div class="mt-2 flex flex-wrap gap-x-14">
              <UiTextButton
                :disabled="!artistImagesAllowed() || artistPictures.picker !== null"
                :data-testid="`info-${role}-choose`"
                @click="openArtistImages(artistName)"
                >{{ t('info_choose') }}</UiTextButton
              >
              <UiTextButton
                v-if="credit(role)"
                :data-testid="`${role}-remove`"
                @click="forgetArtistImage(artistName, role)"
                >{{ t('info_remove') }}</UiTextButton
              >
            </div>
          </div>
        </div>
        <p v-if="!artistImagesAllowed()" class="mt-6 mb-0 text-footnote leading-[1.5] text-secondary">
          {{ t('info_images_off') }}
        </p>
      </template>
      <template v-else-if="album">
        <div class="grid grid-cols-[auto_1fr] items-center gap-12" data-testid="info-cover">
          <span class="block size-56 overflow-hidden rounded-10 bg-soft">
            <CoverCanvas v-if="cover" :blob="cover" />
          </span>
          <div class="min-w-0 text-footnote leading-[1.45]">
            <p class="m-0 font-semibold text-ink">{{ t('info_cover') }}</p>
            <p class="m-0 text-secondary" data-testid="info-cover-where">{{ coverWhere }}</p>
            <div class="mt-2 flex flex-wrap gap-x-14">
              <UiTextButton
                :disabled="!coverChoosable"
                data-testid="info-cover-choose"
                @click="album && openCoverPicker(album, scope)"
                >{{ t(onCard?.kind === 'folder' ? 'info_choose_other' : 'info_choose') }}</UiTextButton
              >
            </div>
          </div>
        </div>
        <p class="mt-8 mb-0 text-footnote leading-[1.5] text-secondary">
          {{
            onCard?.kind === 'embedded'
              ? t('cover_embedded')
              : !coverLookupAllowed()
                ? t('info_cover_off')
                : onCard?.kind === 'folder'
                  ? t('cover_replace_note')
                  : ''
          }}
        </p>
      </template>
    </section>

    <section class="mt-24" aria-labelledby="info-links" data-testid="info-links">
      <h3 id="info-links" class="mt-0 mb-10 text-title3 font-bold tracking-heading">{{ t('info_links') }}</h3>
      <p v-if="artistName && artistId" class="m-0 text-footnote leading-[1.7] text-muted">
        <a
          :href="`https://musicbrainz.org/artist/${artistId.mbid}`"
          target="_blank"
          rel="noopener noreferrer"
          :class="LINK"
          >MusicBrainz</a
        ><template v-for="(url, kind) in artistId.facts?.links ?? {}" :key="kind">
          ·
          <a :href="url" target="_blank" rel="noopener noreferrer" :class="LINK">{{
            kind === 'official'
              ? t('artist_link_site')
              : kind === 'bandcamp'
                ? 'Bandcamp'
                : kind === 'discogs'
                  ? 'Discogs'
                  : 'Wikidata'
          }}</a></template
        >
      </p>
      <p v-else-if="album && edition" class="m-0 text-footnote leading-[1.7] text-muted">
        <a
          :href="`https://musicbrainz.org/release/${edition.mbid}`"
          target="_blank"
          rel="noopener noreferrer"
          :class="LINK"
          >{{ t('info_link_edition') }}</a
        ><template v-if="edition.group">
          ·
          <a
            :href="`https://musicbrainz.org/release-group/${edition.group}`"
            target="_blank"
            rel="noopener noreferrer"
            :class="LINK"
            >{{ t('info_link_editions') }}</a
          ></template
        >
      </p>
      <p v-else class="m-0 text-footnote text-muted">{{ t('info_links_later') }}</p>
    </section>

    <section class="mt-24" aria-labelledby="info-tags">
      <h3 id="info-tags" class="mt-0 mb-10 text-title3 font-bold tracking-heading">{{ t('info_tags') }}</h3>
      <p class="m-0 rounded-12 border border-dashed border-line px-14 py-12 text-footnote leading-[1.5] text-muted">
        {{ t('info_tags_later') }}
      </p>
    </section>
  </div>
</template>
