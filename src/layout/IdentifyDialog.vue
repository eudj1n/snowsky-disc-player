<script setup lang="ts">
/**
 * Which MusicBrainz artist a name is, or which edition an album is (owner,
 * 2026-10-02: from the details sheet's table, in a window like the image
 * picker's). Opening it asks MusicBrainz (the name, or the title and artist,
 * leave the network); the listener picks one and confirms; the identity is
 * kept on the player when paired, else for the tab. An edition shows its
 * track count, marked when the album on the card has as many (2026-10-02).
 * When no edition fits, the artist's albums can be browsed and one chosen,
 * whose editions then show the same way (owner, 2026-10-02). An album's
 * editions show beside its tracks on the card (owner, 2026-10-08).
 */
import { ref, watch } from 'vue'
import { t } from '../i18n'
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
import UiPillButton from '../ui/UiPillButton.vue'
import AlbumCompare from './AlbumCompare.vue'
import IdentifyChoices from './IdentifyChoices.vue'
import type { IdentifyTarget } from './identify'

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
  <UiDialog
    :open="target !== null"
    eyebrow="MusicBrainz"
    :close-label="t('close')"
    :size="target?.kind === 'album' ? '2xl' : 'xl'"
    @close="close"
  >
    <template v-if="target">
      <h2 class="mt-18 mb-8 text-title2 font-bold tracking-heading">
        {{ target.kind === 'artist' ? target.name : target.title }}
      </h2>
      <p class="m-0 mb-14 text-footnote leading-[1.55] text-muted">
        {{ t(target.kind === 'artist' ? 'info_identify_sends' : 'info_edition_sends') }}
      </p>
      <AlbumCompare v-if="target.kind === 'album'" v-model="chosen" :target="target" />
      <IdentifyChoices v-else v-model="chosen" :target="target" />
      <div class="mt-18 flex justify-end gap-8">
        <UiPillButton variant="secondary" @click="close">{{ t('cancel') }}</UiPillButton>
        <UiPillButton
          :disabled="!chosen || identifying.saving || identifying.status !== 'ready' || identifying.view === 'groups'"
          data-testid="identify-confirm"
          @click="confirm"
          >{{ t('info_confirm') }}</UiPillButton
        >
      </div>
    </template>
  </UiDialog>
</template>
