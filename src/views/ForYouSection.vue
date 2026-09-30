<script setup lang="ts">
/**
 * "Made for you" on Home (owner, 2026-09-30, after Apple Music): the
 * automatic playlists that are not an artist's as tall cards with their own
 * covers; a card opens the list's page and its button plays it on the player.
 * A list not on the player yet looks the same: listening writes it there
 * first (owner, 2026-09-30: one tap); one with nothing to hold is left out.
 */
import { computed } from 'vue'
import ListArt from '../components/artwork/ListArt.vue'
import SectionHeading from '../components/common/SectionHeading.vue'
import { GLOBAL_KINDS } from '../domain/autoPlaylists'
import { listArtists, listBackground } from '../domain/listArt'
import { t } from '../i18n'
import { autoPlaylists, autoPreviews, kindList } from '../stores/autoPlaylists'
import { trackByPath } from '../stores/library'
import UiIcon from '../ui/UiIcon.vue'
import { listenToKind } from './autoLists'

const cards = computed(() =>
  GLOBAL_KINDS.flatMap((kind) => {
    const list = kindList(kind)
    const title = list?.name ?? t(`auto_name_${kind}`)
    const entries = list ? (autoPlaylists.entries[list.name] ?? []) : autoPreviews.value[kind]
    if (!list && !entries.length) return []
    const { names, more } = listArtists(entries, trackByPath.value)
    const artists = names.length
      ? more
        ? t('list_artists_more', { names: names.join(', ') })
        : names.join(', ')
      : null
    // A list not made yet opens as a preview of its kind.
    const to = { name: 'list', params: { name: title }, ...(list ? {} : { query: { kind } }) }
    return [{ kind, list, title, artists, to, background: listBackground(kind, title) }]
  }),
)
</script>

<template>
  <section v-if="cards.length" :aria-label="t('for_you')" data-testid="for-you">
    <SectionHeading :title="t('for_you')" :subtitle="t('for_you_subtitle')" />
    <div class="grid grid-cols-4 gap-14 compact:grid-cols-3 rail:grid-cols-2 phone:grid-cols-2 phone:gap-10">
      <article v-for="card in cards" :key="card.kind" class="group/card relative min-w-0" :data-kind="card.kind">
        <RouterLink
          :to="card.to"
          :aria-label="t('open_item', { name: card.title })"
          class="group block aspect-[3/4] overflow-hidden rounded-14 shadow-[0_12px_32px_#1a22141f]"
        >
          <ListArt :title="card.title" :background="card.background" :artists="card.artists" />
        </RouterLink>
        <button
          type="button"
          :aria-label="t('play_item', { name: card.title })"
          :title="t('play_item', { name: card.title })"
          class="absolute right-12 bottom-12 grid size-40 translate-y-4 place-items-center rounded-full border border-[#ffffff40] bg-[#ffffff2e] p-0 text-white opacity-0 shadow-[0_6px_18px_#0003] backdrop-blur-[12px] transition-[opacity,translate,scale,background-color] duration-200 group-focus-within/card:translate-y-0 group-focus-within/card:opacity-100 group-hover/card:translate-y-0 group-hover/card:opacity-100 hover:scale-[1.06] hover:bg-[#ffffff45] motion-reduce:translate-y-0 motion-reduce:transition-none [@media(hover:none)]:hidden"
          @click="listenToKind(card.kind)"
        >
          <UiIcon name="play" filled class="size-16 translate-x-1" />
        </button>
      </article>
    </div>
  </section>
</template>
