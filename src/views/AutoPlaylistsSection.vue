<script setup lang="ts">
/**
 * The automatic playlists on the Playlists page (owner, 2026-09-30): the
 * three lists that are not an artist's, each added to the player or removed
 * here, and the artists' lists made on their pages. A list plays on the
 * player from its first entry; "Update now" brings every list up to date.
 */
import { computed } from 'vue'
import ListArt from '../components/artwork/ListArt.vue'
import SectionHeading from '../components/common/SectionHeading.vue'
import { GLOBAL_KINDS, type AutoPlaylist, type GlobalKind } from '../domain/autoPlaylists'
import { listBackground, shortDay } from '../domain/listArt'
import { locale, t } from '../i18n'
import { autoPlaylists, autoPreviews, kindList, makeKindList, refreshAutoPlaylists } from '../stores/autoPlaylists'
import { pairing } from '../stores/pairing'
import UiIconButton from '../ui/UiIconButton.vue'
import UiPillButton from '../ui/UiPillButton.vue'
import UiTextButton from '../ui/UiTextButton.vue'
import UiActionMenu from '../ui/UiActionMenu.vue'
import { artistRoute } from './captions'
import { CARD_ROW } from './cardRows'
import { autoListItems, keptLabel, onAutoListAction } from './autoListActions'
import { playFrom } from './playAlbum'

interface Row {
  kind: GlobalKind | null
  list: AutoPlaylist | null
  artist: string | null
}
const rows = computed<Row[]>(() => [
  ...GLOBAL_KINDS.map((kind) => ({ kind, list: kindList(kind), artist: null })),
  ...autoPlaylists.lists
    .filter((list) => list.kind === 'artist_most_played')
    .map((list) => ({ kind: null, list, artist: list.artist ?? null })),
])
const rowTitle = (row: Row) => row.list?.name ?? t(`auto_name_${row.kind ?? 'most_played'}`)
const rowKind = (row: Row) => row.list?.kind ?? row.kind ?? 'most_played'
const rowRoute = (row: Row) =>
  row.list
    ? { name: 'list', params: { name: row.list.name } }
    : { name: 'list', params: { name: rowTitle(row) }, query: { kind: row.kind ?? 'most_played' } }
/** Its size, and for a list on the player the day it was last drawn. */
function rowFacts(row: Row): string {
  const tracks = row.list ? count(row.list) : row.kind ? autoPreviews.value[row.kind].length : null
  const parts = tracks === null ? [] : [t('track_count', { count: tracks })]
  // How it is kept, and the day it was last drawn (owner, 2026-09-30).
  if (row.list) parts.push(keptLabel(row.list))
  if (row.list?.written) parts.push(shortDay(row.list.written, locale.value))
  return parts.join(' · ')
}
const count = (list: AutoPlaylist) => autoPlaylists.entries[list.name]?.length ?? null
const busy = computed(() => autoPlaylists.busy || autoPlaylists.refreshing || !pairing.paired)
const updated = computed(() =>
  autoPlaylists.refreshedAt === null
    ? null
    : t('auto_updated', {
        time: new Intl.DateTimeFormat(locale.value, { timeStyle: 'short' }).format(autoPlaylists.refreshedAt),
      }),
)
</script>

<template>
  <section :aria-label="t('auto_section')" data-testid="auto-playlists">
    <SectionHeading :title="t('auto_section')" :subtitle="t('auto_section_note')">
      <div class="flex shrink-0 items-center gap-10">
        <span v-if="updated" class="text-footnote text-muted phone:hidden">{{ updated }}</span>
        <UiTextButton
          class="text-footnote"
          :disabled="busy || !autoPlaylists.lists.length"
          data-testid="auto-refresh"
          @click="refreshAutoPlaylists(true)"
          >{{ autoPlaylists.refreshing ? t('auto_refreshing') : t('auto_refresh') }}</UiTextButton
        >
      </div>
    </SectionHeading>
    <ul class="m-0 list-none p-0">
      <li
        v-for="row in rows"
        :key="row.list?.name ?? row.kind ?? ''"
        class="flex items-center gap-14 border-b border-line py-9 last:border-b-0"
        :class="CARD_ROW"
        :data-kind="row.kind ?? 'artist_most_played'"
      >
        <span class="size-44 shrink-0 overflow-hidden rounded-8" :class="{ 'opacity-45 saturate-[.55]': !row.list }">
          <ListArt :title="rowTitle(row)" :background="listBackground(rowKind(row), rowTitle(row))" thumb />
        </span>
        <div class="min-w-0 flex-1">
          <!-- A list not added yet opens as a preview, as from Home (owner, 2026-09-30). -->
          <RouterLink :to="rowRoute(row)" class="block truncate text-body font-semibold hover:underline">{{
            rowTitle(row)
          }}</RouterLink>
          <p class="m-0 mt-2 truncate text-footnote text-muted">
            {{ rowFacts(row) }}
            <template v-if="row.artist">
              ·
              <RouterLink :to="artistRoute(row.artist)" class="hover:text-ink hover:underline">{{
                row.artist
              }}</RouterLink>
            </template>
          </p>
        </div>
        <template v-if="row.list">
          <UiIconButton
            icon="play"
            :label="t('play_item', { name: row.list.name })"
            :disabled="busy || !count(row.list)"
            @click="row.list && playFrom({ kind: 'list', scope: 'external', name: row.list.name })"
          />
          <UiActionMenu
            :label="`${t('more_actions')}: ${row.list.name}`"
            :items="autoListItems(row.list, busy)"
            data-testid="auto-row-actions"
            @choose="(id) => row.list && onAutoListAction(row.list, id)"
          />
        </template>
        <UiPillButton
          v-else-if="row.kind"
          variant="secondary"
          icon="playlist"
          :disabled="busy || !autoPreviews[row.kind].length"
          @click="row.kind && makeKindList(row.kind)"
          >{{ t('auto_add') }}</UiPillButton
        >
      </li>
    </ul>
  </section>
</template>
