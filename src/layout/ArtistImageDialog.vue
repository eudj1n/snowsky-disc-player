<script setup lang="ts">
/**
 * The artist image picker (owner, 2026-10-01; one window per image, 2026-10-02): which MusicBrainz artist the
 * name is (another one can be chosen among namesakes), then the photos and
 * wide backgrounds the allowed sources hold for it, as small previews to
 * choose from; Save keeps the choice on the player when this browser is
 * paired, else in this browser. Tiles follow the appearance options: a
 * bordered button, the accent border on the one chosen.
 */
import { computed, ref, watch } from 'vue'
import { t, type MessageKey } from '../i18n'
import {
  artistPictures,
  chooseArtist,
  closeArtistImages,
  listArtists,
  saveArtistImages,
  type ImageOffer,
  type ImageRole,
} from '../stores/artistPictures'
import { musicbrainzIds } from '../stores/musicbrainzIds'
import { pairing } from '../stores/pairing'
import UiDialog from '../ui/UiDialog.vue'
import UiPillButton from '../ui/UiPillButton.vue'
import UiSkeleton from '../ui/UiSkeleton.vue'
import UiTextButton from '../ui/UiTextButton.vue'
import CoverCanvas from '../components/artwork/CoverCanvas.vue'
import { artistFactsLine } from '../views/captions'

const picker = computed(() => artistPictures.picker)
const chosen = ref<Partial<Record<ImageRole, ImageOffer>>>({})
const listing = ref(false)
watch(
  () => [picker.value?.name, picker.value?.mbid],
  () => {
    chosen.value = {}
  },
)
watch(
  () => picker.value === null,
  (closed) => {
    if (closed) listing.value = false
  },
)

const line = artistFactsLine
const identity = computed(() => picker.value?.facts ?? null)
const SOURCE_NAMES = { wikimedia: 'Wikimedia Commons', fanarttv: 'fanart.tv' } as const

const status = computed<MessageKey | null>(() => {
  const value = picker.value
  if (!value) return null
  if (value.status === 'identifying') return 'images_identifying'
  if (value.status === 'searching') return 'images_searching'
  if (value.status === 'failed') return 'images_failed'
  if (
    value.status === 'missing' ||
    (value.status === 'ready' && !(value.role === 'photo' ? value.photos : value.backgrounds).length)
  )
    return value.mbid ? 'images_missing' : 'images_no_artist'
  return null
})
const keptOnPlayer = computed(() => pairing.stored && musicbrainzIds.available)

function pick(offer: ImageOffer): void {
  chosen.value = { ...chosen.value, [offer.role]: chosen.value[offer.role]?.url === offer.url ? undefined : offer }
}
async function showArtists(): Promise<void> {
  listing.value = !listing.value
  if (listing.value) await listArtists()
}
async function another(mbid: string): Promise<void> {
  listing.value = false
  await chooseArtist(mbid)
}
const sections = computed(() => {
  const value = picker.value
  if (!value) return []
  return value.role === 'photo'
    ? ([{ role: 'photo', title: 'images_photo', offers: value.photos }] as const)
    : ([{ role: 'background', title: 'images_background', offers: value.backgrounds }] as const)
})
</script>

<template>
  <UiDialog
    :open="picker !== null"
    :eyebrow="t(picker?.role === 'background' ? 'images_background_eyebrow' : 'images_photo_eyebrow')"
    :close-label="t('close')"
    size="xl"
    @close="closeArtistImages"
  >
    <template v-if="picker">
      <h2 class="mt-18 mb-8 text-title2 font-bold tracking-heading">{{ picker.name }}</h2>
      <div
        class="my-14 flex flex-wrap items-center justify-between gap-x-12 gap-y-6 rounded-10 bg-soft px-14 py-12"
        data-testid="images-identity"
      >
        <p class="m-0 min-w-0 text-footnote leading-[1.5] text-secondary">
          <span class="text-muted">MusicBrainz:&#32;</span>
          <template v-if="identity">
            <strong class="font-semibold text-ink">{{ identity.name }}</strong>
            <template v-if="line(identity)"> · {{ line(identity) }}</template>
          </template>
          <template v-else>…</template>
        </p>
        <UiTextButton
          :disabled="picker.status === 'saving'"
          :aria-expanded="listing"
          data-testid="images-other-artist"
          @click="showArtists"
          >{{ t('images_other_artist') }}</UiTextButton
        >
      </div>
      <div
        v-if="listing"
        role="group"
        :aria-label="t('images_other_artist')"
        class="mb-14 grid gap-6"
        data-testid="images-artists"
      >
        <p v-if="!picker.candidates.length" class="m-0 text-footnote text-muted">{{ t('images_identifying') }}</p>
        <button
          v-for="candidate in picker.candidates"
          :key="candidate.id"
          type="button"
          :aria-pressed="candidate.id === picker.mbid"
          class="rounded-10 border border-line px-14 py-10 text-left text-footnote text-secondary hover:bg-hover aria-pressed:border-accent aria-pressed:text-ink"
          @click="another(candidate.id)"
        >
          <strong class="font-semibold text-ink">{{ candidate.name }}</strong>
          <template v-if="line(candidate)"> · {{ line(candidate) }}</template>
        </button>
      </div>
      <p v-if="status" role="status" class="m-0 mb-14 text-footnote text-secondary" data-testid="images-status">
        {{ t(status) }}
      </p>
      <p v-if="picker.keyRefused" role="status" class="m-0 mb-14 text-footnote text-notice">
        {{ t('images_key_refused') }}
      </p>
      <template v-for="section in sections" :key="section.role">
        <section v-if="section.offers.length" class="mb-18" :data-testid="`images-${section.role}s`">
          <h3 class="mt-0 mb-10 text-callout font-semibold">{{ t(section.title) }}</h3>
          <div
            role="group"
            :aria-label="t(section.title)"
            class="grid gap-8"
            :class="
              section.role === 'photo'
                ? 'grid-cols-[repeat(auto-fill,minmax(104px,1fr))]'
                : 'grid-cols-[repeat(auto-fill,minmax(180px,1fr))]'
            "
          >
            <button
              v-for="offer in section.offers"
              :key="offer.url"
              type="button"
              :aria-pressed="chosen[section.role]?.url === offer.url"
              :aria-label="`${t(section.title)}: ${SOURCE_NAMES[offer.source]}`"
              class="rounded-10 border border-line p-6 text-caption text-muted aria-pressed:border-accent aria-pressed:text-ink"
              @click="pick(offer)"
            >
              <span
                class="mb-6 block overflow-hidden rounded-5"
                :class="section.role === 'photo' ? 'aspect-square' : 'aspect-video'"
              >
                <CoverCanvas v-if="offer.previewBlob" :blob="offer.previewBlob" />
                <UiSkeleton v-else class="size-full" />
              </span>
              {{ SOURCE_NAMES[offer.source] }}
            </button>
          </div>
        </section>
      </template>
      <p class="mt-4 mb-0 text-caption leading-[1.5] text-muted">
        {{ t(keptOnPlayer ? 'images_kept_player_note' : 'images_kept_browser_note') }}
      </p>
      <div class="mt-18 flex justify-end gap-8">
        <UiPillButton variant="secondary" @click="closeArtistImages">{{ t('cancel') }}</UiPillButton>
        <UiPillButton
          :disabled="picker.status === 'saving' || !chosen[picker.role]"
          data-testid="images-save"
          @click="saveArtistImages(chosen)"
          >{{ t('images_save') }}</UiPillButton
        >
      </div>
    </template>
  </UiDialog>
</template>
