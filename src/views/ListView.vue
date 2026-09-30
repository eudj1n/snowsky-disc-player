<script setup lang="ts">
/**
 * An automatic playlist (owner, 2026-09-30): its cover, the tracks it holds
 * in play order, and playing it on the player (from the start or from a row,
 * `0100` with the entry's position) or in this browser. The list is the
 * page's own (the store names it); the player's file view plays the same
 * file without the page. A list that is not an artist's and not made yet
 * (`?kind=`, from Home) shows what it would hold; listening writes it to the
 * player first (owner, 2026-09-30: one tap).
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ListArt from '../components/artwork/ListArt.vue'
import DetailHeading from '../components/collection/DetailHeading.vue'
import TrackList from '../components/track/TrackList.vue'
import { queueContext } from '../domain/history'
import { listArtists, listBackground, shortDay } from '../domain/listArt'
import { filterBy } from '../domain/search'
import type { LibraryTrack } from '../domain/track'
import { locale, t } from '../i18n'
import {
  autoPlaylists,
  autoPreviews,
  refreshAutoPlaylists,
  removeAutoList,
  setAutoPeriod,
} from '../stores/autoPlaylists'
import { GLOBAL_KINDS, PERIODS, type GlobalKind, type RotationPeriod } from '../domain/autoPlaylists'
import { playInBrowser } from '../stores/browser'
import { connection } from '../stores/connection'
import { trackByPath } from '../stores/library'
import { openTrackMenu, ui } from '../stores/ui'
import UiCircleButton from '../ui/UiCircleButton.vue'
import UiPillButton from '../ui/UiPillButton.vue'
import UiSelect from '../ui/UiSelect.vue'
import UiTextButton from '../ui/UiTextButton.vue'
import CollectionGate from './CollectionGate.vue'
import { useHeadingAction } from './headingAction'
import { listenToKind } from './autoLists'
import { playFrom } from './playAlbum'
import { onRowFavorite, onRowUnfavorite, trackRowProps } from './trackRows'

const route = useRoute()
const router = useRouter()
const name = computed(() => String(route.params.name ?? ''))
const list = computed(() => autoPlaylists.lists.find((item) => item.name === name.value) ?? null)
/** A preview of a list not made yet: its kind from the address. */
const preview = computed<GlobalKind | null>(() => {
  const kind = route.query.kind
  return !list.value && typeof kind === 'string' && (GLOBAL_KINDS as readonly string[]).includes(kind)
    ? (kind as GlobalKind)
    : null
})
const entries = computed(() =>
  preview.value ? autoPreviews.value[preview.value] : (autoPlaylists.entries[name.value] ?? null),
)
/** The entries the library knows, each with its position in the list (what stock plays from). */
const rows = computed(() =>
  (entries.value ?? []).flatMap((path, position) => {
    const track = trackByPath.value.get(path)
    return track ? [{ track, position }] : []
  }),
)
const tracks = computed<LibraryTrack[]>(() => rows.value.map((row) => row.track))
const searching = computed(() => ui.query.trim() !== '')
const items = computed(() => filterBy(tracks.value, ui.query, (track) => [track.title, track.artist, track.album]))
const background = computed(() => listBackground(list.value?.kind ?? preview.value ?? 'most_played', name.value))
const artists = computed(() => {
  const { names, more } = listArtists(entries.value ?? [], trackByPath.value)
  return names.length ? (more ? t('list_artists_more', { names: names.join(', ') }) : names.join(', ')) : null
})
const target = (position?: number) =>
  ({ kind: 'list', scope: 'external', name: name.value, ...(position === undefined ? {} : { position }) }) as const
const heading = useHeadingAction({
  owns: (track) => (entries.value ?? []).includes(track.path ?? ''),
  label: () => t('listen_playlist'),
  disabled: () => !rows.value.length,
  play: () => void listen(),
})
/** A row plays the list from its own entry. */
function playRow(index: number): void {
  const track = items.value[index]
  const row = rows.value.find((item) => item.track === track)
  if (row) void listen(row.position)
}
function openMenu(index: number, anchor: HTMLElement): void {
  const track = items.value[index]
  const row = rows.value.find((item) => item.track === track)
  if (track) openTrackMenu(track, row ? target(row.position) : null, anchor)
}
function inBrowser(): void {
  playInBrowser(tracks.value, 0, queueContext(entries.value ?? [], { type: 4 }))
}
/** Plays the list on the player; a list not there yet is written first, and the page becomes its own. */
async function listen(position?: number): Promise<void> {
  const kind = preview.value
  if (!kind) {
    await playFrom(target(position))
    return
  }
  const made = await listenToKind(kind, position)
  if (made) await router.replace({ name: 'list', params: { name: made } })
}
async function remove(): Promise<void> {
  if (!list.value || !confirm(t('auto_remove_confirm', { name: name.value }))) return
  await removeAutoList(list.value)
  if (!autoPlaylists.lists.some((item) => item.name === name.value)) await router.push('/playlists')
}
</script>

<template>
  <CollectionGate
    :count="items.length"
    :searching="searching"
    empty-key="search_empty_tracks"
    :ready="entries !== null || (autoPlaylists.available && !list)"
  >
    <template #heading="{ loading }">
      <UiTextButton class="text-12" @click="router.push('/playlists')">← {{ t('back_to_collection') }}</UiTextButton>
      <DetailHeading
        :title="name"
        :kind="t('kind_auto_playlist')"
        :sticky-action="loading ? null : heading.action.value"
        @sticky="heading.run"
      >
        <template #artwork><ListArt :title="name" :background="background" :artists="artists" /></template>
        <template #sticky>{{ t('track_count', { count: rows.length }) }}</template>
        <template #meta>
          <template v-if="list"
            >{{ t('track_count', { count: rows.length })
            }}<template v-if="list.written">
              · {{ t('auto_updated_on', { date: shortDay(list.written, locale) }) }}</template
            ></template
          >
          <template v-else-if="preview">{{ t('track_count', { count: rows.length }) }}</template>
          <template v-else>{{ t('auto_list_missing') }}</template>
        </template>
        <UiPillButton
          icon="play"
          :disabled="loading || !rows.length || autoPlaylists.busy"
          data-testid="list-play"
          @click="listen()"
          >{{ t('listen_playlist') }}</UiPillButton
        >
        <UiCircleButton
          v-if="connection.media"
          icon="headphones"
          :label="t('play_in_browser')"
          :disabled="loading || !rows.length"
          data-testid="list-browser"
          @click="inBrowser"
        />
        <!-- How long it stays as written, and drawing it again now (owner, 2026-09-30). -->
        <UiSelect v-if="list" size="sm">
          <select
            :value="list.period ?? 'day'"
            :aria-label="t('auto_period')"
            :disabled="autoPlaylists.busy || autoPlaylists.refreshing"
            data-testid="list-period"
            class="rounded-18 border border-line bg-soft py-9 pl-12 text-12 text-secondary"
            @change="list && setAutoPeriod(list, ($event.target as HTMLSelectElement).value as RotationPeriod)"
          >
            <option v-for="period in PERIODS" :key="period" :value="period">{{ t(`auto_period_${period}`) }}</option>
          </select>
        </UiSelect>
        <UiTextButton
          v-if="list"
          :disabled="autoPlaylists.busy || autoPlaylists.refreshing"
          data-testid="list-refresh"
          @click="refreshAutoPlaylists(true, name)"
          >{{ t('auto_refresh') }}</UiTextButton
        >
        <UiTextButton v-if="list" :disabled="autoPlaylists.busy" @click="remove">{{ t('auto_remove') }}</UiTextButton>
      </DetailHeading>
    </template>
    <TrackList
      v-bind="trackRowProps"
      :tracks="items"
      @play="playRow"
      @menu="openMenu"
      @favorite="onRowFavorite"
      @unfavorite="onRowUnfavorite"
    />
  </CollectionGate>
</template>
