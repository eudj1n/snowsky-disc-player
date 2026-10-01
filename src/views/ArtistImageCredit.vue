<script setup lang="ts">
/**
 * The credit under an artist's heading for its photo or background (owner,
 * 2026-10-01: the terms of use go with the image): who made it, linked to its
 * page; its licence, linked; the source when the author is named; where the
 * choice is kept; and a way to remove it. The same line as the Commons
 * photo's credit before.
 */
import { computed } from 'vue'
import { t } from '../i18n'
import { artistPictures, chosenImage, forgetArtistImage, type ImageRole } from '../stores/artistPictures'
import UiTextButton from '../ui/UiTextButton.vue'

const props = defineProps<{ name: string; role: ImageRole }>()
const SOURCE_NAMES = { wikimedia: 'Wikimedia Commons', fanarttv: 'fanart.tv' } as const

const credit = computed(() => {
  const chosen = chosenImage(props.name, props.role)
  if (chosen) return { ...chosen.image, sourceName: SOURCE_NAMES[chosen.image.source], kept: chosen.kept }
  const legacy = props.role === 'photo' ? artistPictures.pictures[props.name] : undefined
  return legacy ? { ...legacy, sourceName: SOURCE_NAMES.wikimedia, kept: 'browser' as const } : null
})
</script>

<template>
  <p v-if="credit" class="-mt-8 mb-12 text-footnote text-muted last:mb-20" :data-testid="`${role}-credit`">
    {{ t(role === 'photo' ? 'photo_credit' : 'images_background') }}:
    <a
      v-if="credit.page"
      :href="credit.page"
      target="_blank"
      rel="noopener noreferrer"
      class="text-secondary underline-offset-3 hover:text-ink hover:underline"
      >{{ credit.author ?? credit.sourceName }}</a
    ><template v-else>{{ credit.author ?? credit.sourceName }}</template
    ><template v-if="credit.license">
      ·
      <a
        v-if="credit.licenseUrl"
        :href="credit.licenseUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="underline-offset-3 hover:text-ink hover:underline"
        >{{ credit.license }}</a
      ><template v-else>{{ credit.license }}</template></template
    ><template v-if="credit.author"> · {{ credit.sourceName }}</template> ·
    {{ t(credit.kept === 'player' ? 'image_kept_player' : 'photo_kept') }}
    <UiTextButton
      class="ml-6 inline-flex! align-baseline text-footnote"
      :data-testid="`${role}-remove`"
      @click="forgetArtistImage(name, role)"
      >{{ t(role === 'photo' ? 'photo_remove' : 'background_remove') }}</UiTextButton
    >
  </p>
</template>
