<script setup lang="ts">
/**
 * The album cover picker (owner, 2026-10-01): the album's editions on
 * MusicBrainz with their own front covers from Cover Art Archive, and
 * fanart.tv's covers of their release group when that source is allowed,
 * as small previews captioned with what tells the editions apart. The chosen
 * one becomes the page's cover offer, saved into the album's folder only on
 * request. Tiles follow the artist image picker and the appearance options.
 */
import { computed, ref, watch } from 'vue'
import type { Album } from '../domain/album'
import { regionName } from '../domain/artistFacts'
import { locale, t, type MessageKey } from '../i18n'
import { closeCoverPicker, coverSearch, useCoverOffer, type CoverOffer } from '../stores/coverSearch'
import UiDialog from '../ui/UiDialog.vue'
import UiPillButton from '../ui/UiPillButton.vue'
import UiSkeleton from '../ui/UiSkeleton.vue'
import CoverCanvas from '../components/artwork/CoverCanvas.vue'

const props = defineProps<{ album: Album | null; scope: string | null }>()
const picker = computed(() => coverSearch.picker)
const chosen = ref<CoverOffer | null>(null)
watch(
  () => picker.value?.key,
  () => {
    chosen.value = null
  },
)

const status = computed<MessageKey | null>(() => {
  const value = picker.value
  if (!value) return null
  if (value.status === 'searching') return 'cover_searching'
  if (value.status === 'missing') return 'cover_missing'
  if (value.status === 'unreachable') return 'cover_unreachable'
  if (value.status === 'failed') return 'cover_failed'
  return null
})
const sections = computed(() => {
  const offers = picker.value?.offers ?? []
  return [
    {
      source: 'coverartarchive',
      title: 'Cover Art Archive',
      offers: offers.filter((o) => o.source === 'coverartarchive'),
    },
    { source: 'fanarttv', title: 'fanart.tv', offers: offers.filter((o) => o.source === 'fanarttv') },
  ] as const
})
/** What tells an edition apart: its year and country, then its format and label; fanart.tv's are the album's. */
function caption(offer: CoverOffer): [string, string] {
  if (offer.source === 'fanarttv') return [t('cover_any_edition'), 'CC BY 3.0']
  const { date, country, format, label } = offer.release
  const first = [date?.slice(0, 4), country ? regionName(country, locale.value) : null].filter(Boolean).join(' · ')
  return [first, [format, label].filter(Boolean).join(' · ')]
}
async function use(): Promise<void> {
  if (chosen.value && props.album) await useCoverOffer(props.album, props.scope, chosen.value)
}
</script>

<template>
  <UiDialog
    :open="picker !== null"
    :eyebrow="t('cover_eyebrow')"
    :close-label="t('close')"
    size="xl"
    @close="closeCoverPicker"
  >
    <template v-if="picker">
      <h2 class="mt-18 mb-8 text-title2 font-bold tracking-heading">{{ picker.title }}</h2>
      <p class="m-0 mb-14 text-footnote leading-[1.55] text-muted">{{ t('cover_picker_note') }}</p>
      <p v-if="status" role="status" class="m-0 mb-14 text-footnote text-secondary" data-testid="cover-status">
        {{ t(status) }}
      </p>
      <p v-if="picker.keyRefused" role="status" class="m-0 mb-14 text-footnote text-notice">
        {{ t('images_key_refused') }}
      </p>
      <template v-for="section in sections" :key="section.source">
        <section v-if="section.offers.length" class="mb-18" :data-testid="`covers-${section.source}`">
          <h3 class="mt-0 mb-10 text-callout font-semibold">{{ section.title }}</h3>
          <div
            role="group"
            :aria-label="section.title"
            class="grid grid-cols-[repeat(auto-fill,minmax(146px,1fr))] gap-8"
          >
            <button
              v-for="offer in section.offers"
              :key="offer.preview"
              type="button"
              :aria-pressed="chosen === offer"
              :aria-label="[section.title, ...caption(offer)].filter(Boolean).join(', ')"
              class="rounded-10 border border-line p-6 text-left text-caption leading-[1.4] text-muted aria-pressed:border-accent aria-pressed:text-ink"
              @click="chosen = chosen === offer ? null : offer"
            >
              <span class="mb-6 block aspect-square overflow-hidden rounded-5">
                <CoverCanvas v-if="offer.previewBlob" :blob="offer.previewBlob" />
                <UiSkeleton v-else class="size-full" />
              </span>
              <span class="block truncate" :title="caption(offer)[0]">{{ caption(offer)[0] || section.title }}</span>
              <span v-if="caption(offer)[1]" class="block truncate" :title="caption(offer)[1]">{{
                caption(offer)[1]
              }}</span>
            </button>
          </div>
        </section>
      </template>
      <div class="mt-18 flex justify-end gap-8">
        <UiPillButton variant="secondary" @click="closeCoverPicker">{{ t('cancel') }}</UiPillButton>
        <UiPillButton :disabled="!chosen" data-testid="cover-use" @click="use">{{ t('cover_use') }}</UiPillButton>
      </div>
    </template>
  </UiDialog>
</template>
