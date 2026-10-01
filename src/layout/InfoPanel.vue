<script setup lang="ts">
/**
 * The details of an artist or album (owner, 2026-10-01; laid out as the
 * track's, 2026-10-02): its images first (the album's cover, or the artist's
 * background with the round photo over it), the actions on them, then the
 * facts as a table like the track's: what MusicBrainz identifies (refined in
 * a window among candidates or editions; nothing is asked before), where the
 * cover lies, the images' credits and the links. A sheet of its own, without
 * the player's tabs.
 */
import { computed, ref, watch } from 'vue'
import Artwork from '../components/artwork/Artwork.vue'
import CoverCanvas from '../components/artwork/CoverCanvas.vue'
import FactTable from '../components/common/FactTable.vue'
import type { FactPart, FactRow } from '../components/common/facts'
import { albumTracks } from '../domain/album'
import { regionName } from '../domain/artistFacts'
import { locale, t } from '../i18n'
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
import { titleGroups, tracks } from '../stores/library'
import { albumIdentity, artistIdentity, identifyAllowed } from '../stores/musicbrainzIds'
import { showCover, ui } from '../stores/ui'
import UiIcon from '../ui/UiIcon.vue'
import { artistTypeName } from '../views/captions'
import IdentifyDialog from './IdentifyDialog.vue'
import type { IdentifyTarget } from './identify'

const emit = defineEmits<{ navigate: [] }>()

const info = computed(() => ui.panelInfo)
const artistName = computed(() => (info.value?.kind === 'artist' ? info.value.name : null))
const album = computed(() => {
  const value = info.value
  return value?.kind === 'album' ? (titleGroups.value.find((item) => item.key === value.key) ?? null) : null
})
const scope = computed(() => (info.value?.kind === 'album' ? info.value.scope : null))
const albumKey = computed(() => (album.value ? albumIdentityKey(album.value, scope.value) : null))
const artistId = computed(() => (artistName.value ? artistIdentity(artistName.value) : null))
const edition = computed(() => (albumKey.value ? albumIdentity(albumKey.value) : null))

/* Images. */
const photo = computed(() => (artistName.value ? artistImage(artistName.value) : null))
const background = computed(() => (artistName.value ? artistBackground(artistName.value) : null))
const cover = computed(() => (album.value ? albumCover(album.value, scope.value) : null))
const imagesBusy = computed(() => !artistImagesAllowed() || artistPictures.picker !== null)
/** The background's band shows once there is one, or once one can be chosen. */
const band = computed(() => background.value !== null || artistImagesAllowed())
/*
 * Changing an image is an action on the image itself (owner, 2026-10-02): shown on hover or keyboard focus,
 * and always on touch screens, which have no hover. A click on the image still opens it in full size.
 */
const CHIP =
  'absolute inline-flex items-center gap-6 rounded-20 border border-line/60 bg-paper/90 text-footnote font-medium text-ink shadow-[0_4px_14px_#0000001f] backdrop-blur-[8px] transition-opacity duration-150 focus-visible:opacity-100 disabled:opacity-60 motion-reduce:transition-none [@media(hover:none)]:opacity-100 [&>svg]:size-15'

/* Where the album's cover lies on the card, read when the sheet shows the album. */
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
const coverChoosable = computed(() => coverLookupAllowed() && onCard.value !== null && onCard.value.kind !== 'embedded')
const coverNote = computed(() => {
  if (onCard.value?.kind === 'embedded') return t('cover_embedded')
  if (!coverLookupAllowed()) return t('info_cover_off')
  return onCard.value?.kind === 'folder' ? t('cover_replace_note') : null
})

/* MusicBrainz, refined in its own window. */
const identifyTarget = ref<IdentifyTarget | null>(null)
watch(info, () => (identifyTarget.value = null))
function identify(): void {
  if (artistName.value) identifyTarget.value = { kind: 'artist', name: artistName.value }
  else if (album.value && albumKey.value) {
    const artist = scope.value ?? album.value.artists[0]
    if (!artist) return
    const count = albumTracks(tracks.value, album.value.title, scope.value).length
    identifyTarget.value = {
      kind: 'album',
      key: albumKey.value,
      title: album.value.title,
      artist,
      trackCount: count || null,
    }
  }
}

const SOURCE_NAMES = { wikimedia: 'Wikimedia Commons', fanarttv: 'fanart.tv' } as const
const year = (date: string | null | undefined) => (date && /^\d{4}/.test(date) ? date.slice(0, 4) : null)
const parts = (...values: (FactPart | null | undefined | false)[]): FactPart[] =>
  values.filter((value): value is FactPart => Boolean(value))

/** An image's credit: its author or source (linked to its page), licence, where it is kept, and Remove. */
function credit(role: ImageRole): FactPart[] | null {
  const name = artistName.value
  if (!name) return null
  const chosen = chosenImage(name, role)
  const legacy = role === 'photo' && !chosen ? artistPictures.pictures[name] : undefined
  const image = chosen?.image ?? (legacy ? { ...legacy, source: 'wikimedia' as const } : null)
  if (!image) return null
  const source = SOURCE_NAMES[image.source]
  const who = image.author ?? source
  return parts(
    image.page ? { text: who, href: image.page } : who,
    image.license && (image.licenseUrl ? { text: image.license, href: image.licenseUrl } : image.license),
    image.author ? source : null,
    t(chosen?.kept === 'player' ? 'image_kept_player' : 'photo_kept'),
    { text: t('info_remove'), action: `remove-${role}` },
  )
}

const identityParts = (kept: boolean): FactPart[] =>
  parts(
    t(kept ? 'info_kept_player' : 'info_kept_tab'),
    identifyAllowed() && { text: t('info_refine'), action: 'identify' },
  )
const missingParts = (
  label: 'info_not_identified' | 'info_no_edition',
  action: 'info_identify' | 'info_choose_edition',
) => (identifyAllowed() ? [t(label), { text: t(action), action: 'identify' }] : [t('info_musicbrainz_off')])
const LINK_NAMES: Record<string, string> = { bandcamp: 'Bandcamp', discogs: 'Discogs', wikidata: 'Wikidata' }

const artistRows = computed<FactRow[]>(() => {
  const identity = artistId.value
  const facts = identity?.facts
  const rows: FactRow[] = []
  if (facts) {
    const type = artistTypeName(facts.type)
    if (type) rows.push({ key: 'type', label: t('fact_type'), parts: [type] })
    if (facts.country)
      rows.push({ key: 'country', label: t('fact_country'), parts: [regionName(facts.country, locale.value)] })
    const begin = year(facts.begin)
    const end = year(facts.end)
    if (begin || end) rows.push({ key: 'years', label: t('fact_years'), parts: [`${begin ?? '?'}–${end ?? ''}`] })
    if (facts.aliases.length)
      rows.push({ key: 'aliases', label: t('fact_aliases'), parts: [facts.aliases.slice(0, 4).join(', ')] })
  }
  rows.push({ key: 'photo', label: t('images_photo'), parts: credit('photo') ?? [t('info_photo_stand_in')] })
  rows.push({
    key: 'background',
    label: t('images_background'),
    parts: credit('background') ?? [t('info_background_none')],
  })
  if (identity) {
    const links = Object.entries(facts?.links ?? {}).map(([kind, url]) => ({
      text: kind === 'official' ? t('artist_link_site') : (LINK_NAMES[kind] ?? kind),
      href: url,
    }))
    rows.push({
      key: 'links',
      label: t('info_links'),
      parts: [{ text: 'MusicBrainz', href: `https://musicbrainz.org/artist/${identity.mbid}` }, ...links],
    })
  }
  rows.push({
    key: 'musicbrainz',
    label: 'MusicBrainz',
    parts: identity ? identityParts(identity.kept) : missingParts('info_not_identified', 'info_identify'),
  })
  return rows
})

const coverWhere = computed(() => {
  const where = onCard.value
  if (!where) return t('info_cover_reading')
  if (where.kind === 'folder') return t('info_cover_folder', { name: where.name })
  if (where.kind === 'embedded') return t('info_cover_embedded')
  return t(where.kind === 'none' ? 'info_cover_none' : 'info_cover_unknown')
})

const albumRows = computed<FactRow[]>(() => {
  const identity = edition.value
  const facts = identity?.facts
  const rows: FactRow[] = []
  if (facts) {
    const label = [facts.label, facts.catalogNumber].filter(Boolean).join(' ')
    if (label) rows.push({ key: 'label', label: t('fact_label'), parts: [label] })
    const issue = [
      year(facts.date),
      facts.country ? regionName(facts.country, locale.value) : null,
      facts.format,
    ].filter(Boolean)
    if (issue.length) rows.push({ key: 'issue', label: t('fact_issue'), parts: [issue.join(' · ')] })
    const first = [year(facts.firstRelease), facts.type, ...(facts.secondaryTypes ?? [])].filter(Boolean)
    if (first.length) rows.push({ key: 'first', label: t('fact_first_release'), parts: [first.join(' · ')] })
    if (facts.barcode) rows.push({ key: 'barcode', label: t('fact_barcode'), parts: [facts.barcode] })
  }
  rows.push({ key: 'cover', label: t('info_cover'), parts: [coverWhere.value] })
  if (identity)
    rows.push({
      key: 'links',
      label: t('info_links'),
      parts: parts(
        { text: t('info_link_edition'), href: `https://musicbrainz.org/release/${identity.mbid}` },
        identity.group && {
          text: t('info_link_editions'),
          href: `https://musicbrainz.org/release-group/${identity.group}`,
        },
      ),
    })
  rows.push({
    key: 'musicbrainz',
    label: 'MusicBrainz',
    parts: identity ? identityParts(identity.kept) : missingParts('info_no_edition', 'info_choose_edition'),
  })
  return rows
})

function onAction(id: string): void {
  if (id === 'identify') identify()
  else if (artistName.value && (id === 'remove-photo' || id === 'remove-background'))
    void forgetArtistImage(artistName.value, id === 'remove-photo' ? 'photo' : 'background')
}
const settingsNeeded = computed(() =>
  artistName.value ? !artistImagesAllowed() || !identifyAllowed() : !coverLookupAllowed() || !identifyAllowed(),
)
</script>

<template>
  <div
    v-if="info"
    class="min-h-0 flex-1 [scrollbar-width:thin] overflow-auto overscroll-contain px-24 pb-28"
    data-testid="info-panel"
  >
    <template v-if="artistName">
      <!-- The background as a band with the round photo over it; without one to show or choose, the photo alone. -->
      <div data-testid="info-artist-images">
        <div
          v-if="band"
          class="group/background relative aspect-[16/9] w-full overflow-hidden rounded-14 bg-soft shadow-[0_12px_28px_#07100820]"
          data-testid="info-background-image"
        >
          <button
            v-if="background"
            type="button"
            class="block size-full cursor-zoom-in p-0"
            :aria-label="t('cover_full_size', { name: artistName })"
            @click="background && artistName && showCover(background, artistName)"
          >
            <CoverCanvas :blob="background" />
          </button>
          <button
            type="button"
            :class="[
              CHIP,
              'px-12 py-6',
              background
                ? 'top-10 right-10 opacity-0 group-focus-within/background:opacity-100 group-hover/background:opacity-100'
                : 'inset-0 m-auto h-fit w-fit',
            ]"
            :disabled="imagesBusy"
            data-testid="info-background-choose"
            @click="artistName && openArtistImages(artistName, 'background')"
          >
            <UiIcon name="image" />{{ t(background ? 'info_change_background' : 'info_choose_background') }}
          </button>
        </div>
        <div
          class="group/photo relative"
          :class="band ? '-mt-52 ml-18 size-104' : 'mx-auto size-200 phone:size-[min(200px,26dvh)]'"
        >
          <button
            type="button"
            class="block size-full overflow-hidden rounded-full bg-soft p-0 text-ink shadow-[0_12px_28px_#07100820] disabled:cursor-default"
            :class="{ 'ring-4 ring-raised': band }"
            :aria-label="t('cover_full_size', { name: artistName })"
            :disabled="!photo"
            @click="photo && artistName && showCover(photo, artistName)"
          >
            <Artwork :title="artistName" artist :cover="photo" />
          </button>
          <button
            type="button"
            :class="[
              CHIP,
              'right-0 bottom-0 size-34 justify-center p-0 opacity-0 group-focus-within/photo:opacity-100 group-hover/photo:opacity-100',
            ]"
            :aria-label="t('info_choose_photo')"
            :title="t('info_choose_photo')"
            :disabled="imagesBusy"
            data-testid="info-photo-choose"
            @click="artistName && openArtistImages(artistName, 'photo')"
          >
            <UiIcon name="image" />
          </button>
        </div>
      </div>
      <span class="mt-22 block text-caption2 font-semibold tracking-caps text-muted uppercase">{{
        t('kind_artist')
      }}</span>
      <h2 class="mt-6 mb-4 text-title2 font-bold tracking-heading" data-testid="info-title">{{ artistName }}</h2>
      <FactTable class="mt-24" :heading="t('facts_artist')" :rows="artistRows" @action="onAction" />
    </template>

    <template v-else-if="album">
      <div class="group/cover relative mx-auto aspect-square w-full phone:w-[min(100%,30dvh)]">
        <button
          type="button"
          class="block size-full overflow-hidden rounded-14 bg-soft p-0 text-ink shadow-[0_12px_28px_#07100820] disabled:cursor-default"
          :aria-label="t('cover_full_size', { name: album.title })"
          :disabled="!cover"
          @click="cover && album && showCover(cover, album.title)"
        >
          <Artwork :title="album.title" :cover="cover" />
        </button>
        <button
          type="button"
          :class="[
            CHIP,
            'right-12 bottom-12 px-12 py-6 opacity-0 group-focus-within/cover:opacity-100 group-hover/cover:opacity-100',
          ]"
          :disabled="!coverChoosable"
          data-testid="info-cover-choose"
          @click="album && openCoverPicker(album, scope)"
        >
          <UiIcon name="image" />{{ t(onCard?.kind === 'folder' ? 'info_change_cover' : 'info_choose_cover') }}
        </button>
      </div>
      <span class="mt-22 block text-caption2 font-semibold tracking-caps text-muted uppercase">{{
        t('kind_album')
      }}</span>
      <h2 class="mt-6 mb-4 text-title2 font-bold tracking-heading" data-testid="info-title">{{ album.title }}</h2>
      <p class="m-0 text-footnote text-muted">{{ scope ?? album.artists[0] ?? '' }}</p>
      <p v-if="coverNote" class="mt-10 mb-0 text-footnote leading-[1.5] text-muted" data-testid="info-cover-note">
        {{ coverNote }}
      </p>
      <FactTable class="mt-24" :heading="t('facts_album')" :rows="albumRows" @action="onAction" />
    </template>

    <p v-if="settingsNeeded" class="mt-14 mb-0 text-footnote leading-[1.5] text-muted">
      {{ t('info_sources_note') }}
      <RouterLink
        class="text-secondary underline underline-offset-2 hover:text-ink"
        :to="{ path: '/settings', query: { part: 'sources' } }"
        @click="emit('navigate')"
        >{{ t('external_sources') }}</RouterLink
      >
    </p>
    <IdentifyDialog :target="identifyTarget" @close="identifyTarget = null" />
  </div>
</template>
