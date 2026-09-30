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
import { useCrumbs } from './crumbs'
import { useRoute, useRouter } from 'vue-router'
import ListArt from '../components/artwork/ListArt.vue'
import DetailHeading from '../components/collection/DetailHeading.vue'
import TrackList from '../components/track/TrackList.vue'
import { listArtists, listBackground, shortDay } from '../domain/listArt'
import type { LibraryTrack } from '../domain/track'
import { locale, t } from '../i18n'
import { autoPlaylists, autoPreviews } from '../stores/autoPlaylists'
import { GLOBAL_KINDS, type GlobalKind } from '../domain/autoPlaylists'
import { trackByPath } from '../stores/library'
import { openTrackMenu, openTrackPanel } from '../stores/ui'
import UiPillButton from '../ui/UiPillButton.vue'
import UiActionMenu from '../ui/UiActionMenu.vue'
import CollectionGate from './CollectionGate.vue'
import { useHeadingAction } from './headingAction'
import { listenToKind } from './autoLists'
import { autoListItems, onAutoListAction } from './autoListActions'
import { playFrom } from './playAlbum'
import { onRowFavorite, onRowUnfavorite, trackRowProps } from './trackRows'

const route = useRoute()
const router = useRouter()
const name = computed(() => String(route.params.name ?? ''))
useCrumbs(() => [{ text: t('playlists'), to: '/playlists' }, { text: name.value }])
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
const items = computed(() => tracks.value)
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
function openTrack(index: number, anchor: HTMLElement): void {
  const track = items.value[index]
  const row = rows.value.find((item) => item.track === track)
  if (track) openTrackPanel(track, row ? target(row.position) : null, anchor)
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
async function onAction(id: string): Promise<void> {
  if (!list.value) return
  const removed = await onAutoListAction(list.value, id)
  if (removed && !autoPlaylists.lists.some((item) => item.name === name.value)) await router.push('/playlists')
}
</script>

<template>
  <CollectionGate :count="items.length" :ready="entries !== null || (autoPlaylists.available && !list)">
    <template #heading="{ loading }">
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
        <!-- How often it is drawn, updating and removing it: rare, behind "⋯" (owner, 2026-09-30). -->
        <UiActionMenu
          v-if="list"
          :label="t('more_actions')"
          :items="autoListItems(list, autoPlaylists.busy || autoPlaylists.refreshing)"
          data-testid="list-actions"
          @choose="onAction"
        />
      </DetailHeading>
    </template>
    <TrackList
      v-bind="trackRowProps"
      :tracks="items"
      @play="playRow"
      @menu="openMenu"
      @open="openTrack"
      @favorite="onRowFavorite"
      @unfavorite="onRowUnfavorite"
    />
  </CollectionGate>
</template>
