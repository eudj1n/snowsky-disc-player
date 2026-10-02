<script setup lang="ts">
/**
 * The search palette (owner, 2026-09-30): "/", ⌘K (Ctrl+K) or the top bar's
 * Search opens it over the page. As one types it searches the whole
 * collection (views/searchResults.ts), the section it was opened from first,
 * and the page's commands (paletteCommands.ts); with nothing typed it lists
 * the commands. Arrows move through the options, Enter opens one (a track
 * plays where the bar's switch says), Escape closes; All results opens the
 * search page. A combobox over a grouped listbox (WAI-ARIA).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Artwork from '../components/artwork/Artwork.vue'
import { rank } from '../domain/globalSearch'
import { t } from '../i18n'
import { sectionOf } from '../router'
import { closePalette, ui } from '../stores/ui'
import { backdropDismissal, trackOpen } from '../ui/dialogs'
import UiIcon from '../ui/UiIcon.vue'
import { playFrom } from '../views/playAlbum'
import {
  groupOf,
  hitCover,
  hitIcon,
  hitLine,
  hitRoute,
  hitTarget,
  hitTitle,
  searchCollection,
  type GroupKind,
  type Hit,
} from '../views/searchResults'
import { commandIndex, commands, type Command } from './paletteCommands'

/** How many of each kind the palette shows; the search page shows them all. */
const LIMIT: Record<GroupKind, number> = { tracks: 4, albums: 4, artists: 3, playlists: 3, genres: 3 }

type Option = { id: string; hit: Hit; command?: undefined } | { id: string; hit?: undefined; command: Command }
interface Section {
  id: string
  title: string
  options: Option[]
}

const KEY = 'rounded-4 border border-line px-5 py-1 font-[inherit] text-caption2'
/** ⌘ on Apple keyboards, Ctrl elsewhere. */
const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'
const hints = computed(() => [
  { keys: ['↑', '↓'], label: t('palette_move') },
  { keys: ['↵'], label: t('palette_open') },
  { keys: ['esc'], label: t('palette_close') },
])

const route = useRoute()
const router = useRouter()
const dialog = ref<HTMLDialogElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const list = ref<HTMLElement | null>(null)
const query = ref('')
const active = ref(0)
const from = computed(() => groupOf(sectionOf(route.name)))
const ready = (command: Command) => command.enabled !== false

const sections = computed<Section[]>(() => {
  if (!query.value.trim())
    return [
      {
        id: 'commands',
        title: t('search_commands'),
        options: commands.value.filter(ready).map((command) => ({ id: command.id, command })),
      },
    ]
  const results = searchCollection(query.value, from.value)
  // Commands answer to a name's or a word's start, not to any letters inside.
  const found = rank(commandIndex.value, query.value)
    .filter((entry) => entry.score >= 60 && ready(entry.item))
    .slice(0, 3)
  const commandSection: Section[] = found.length
    ? [
        {
          id: 'commands',
          title: t('search_commands'),
          options: found.map(({ item }) => ({ id: item.id, command: item })),
        },
      ]
    : []
  const collection: Section[] = [
    ...(results.top
      ? [{ id: 'top', title: t('search_top'), options: [{ id: results.top.key, hit: results.top }] }]
      : []),
    ...results.groups.map((group) => ({
      id: group.kind,
      title: t(group.kind),
      options: group.hits.slice(0, LIMIT[group.kind]).map((hit) => ({ id: hit.key, hit })),
    })),
  ]
  // A command named by the query comes before weaker matches in the collection.
  const commandsFirst = found[0] && found[0].score > (results.top?.score ?? 0)
  return commandsFirst ? [...commandSection, ...collection] : [...collection, ...commandSection]
})
const options = computed(() => sections.value.flatMap((section) => section.options))
const optionId = (option: Option) => `palette-${option.command ? 'c' : 'h'}-${option.id}`
const activeOption = computed(() => options.value[active.value] ?? null)
const nothing = computed(() => query.value.trim() !== '' && options.value.length === 0)

watch(query, () => {
  active.value = 0
  if (list.value) list.value.scrollTop = 0
})
watch(active, () => {
  void nextTick(() => {
    const option = activeOption.value
    if (option) document.getElementById(optionId(option))?.scrollIntoView({ block: 'nearest' })
  })
})

function close(): void {
  dialog.value?.close()
  closePalette()
}

/** Closes first, so a dialog a command opens gets the focus. */
function activate(option: Option | null): void {
  if (!option) return
  close()
  if (option.command) {
    option.command.run(router)
    return
  }
  const route = hitRoute(option.hit)
  if (route) {
    void router.push(route)
    return
  }
  const target = hitTarget(option.hit)
  if (target) void playFrom(target)
}

function allResults(): void {
  const q = query.value.trim()
  if (!q) return
  close()
  void router.push({ name: 'search', query: { q, ...(from.value ? { from: from.value } : {}) } })
}

function onKeydown(event: KeyboardEvent): void {
  const count = options.value.length
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!count) return
    active.value = (active.value + (event.key === 'ArrowDown' ? 1 : count - 1)) % count
  } else if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault()
    if (event.metaKey || event.ctrlKey) allResults()
    else activate(activeOption.value)
  } else if (event.code === 'KeyK' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    close()
  }
}

let cleanup = (): void => undefined
function sync(open: boolean): void {
  const element = dialog.value
  if (!element) return
  if (open && !element.open) {
    element.showModal()
    input.value?.select()
  }
  if (!open && element.open) element.close()
  trackOpen(element, open)
}
onMounted(() => {
  const element = dialog.value
  if (!element) return
  cleanup = backdropDismissal(element, close)
  // Escape closes natively. The event comes a task later: by then the palette may be open again (⌘K at once).
  element.addEventListener('close', () => {
    if (element.open) return
    trackOpen(element, false)
    closePalette()
  })
  sync(ui.palette)
})
watch(() => ui.palette, sync)
// Back or Forward while it is open: the palette belongs to the page it was opened on.
watch(
  () => route.fullPath,
  () => {
    if (ui.palette) close()
  },
)
onBeforeUnmount(() => {
  cleanup()
  if (dialog.value) trackOpen(dialog.value, false)
})
</script>

<template>
  <dialog
    ref="dialog"
    :aria-label="t('search')"
    data-testid="search-palette"
    class="mx-auto mt-[12vh] max-h-[76dvh] w-[calc(100%-32px)] max-w-640 flex-col overflow-hidden rounded-18 border border-line bg-paper p-0 text-ink shadow-[0_30px_100px_#27341c30] backdrop:bg-black/30 backdrop:backdrop-blur-[5px] open:flex narrow:mt-10 narrow:max-h-[calc(100dvh-20px)] narrow:w-[calc(100vw-20px)]"
  >
    <label class="flex items-center gap-12 border-b border-line px-20 py-16">
      <UiIcon name="search" class="size-20 shrink-0 text-muted" />
      <input
        ref="input"
        v-model="query"
        type="search"
        role="combobox"
        autocomplete="off"
        spellcheck="false"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls="palette-list"
        :aria-activedescendant="activeOption ? optionId(activeOption) : undefined"
        :aria-label="t('search_collection')"
        :placeholder="t('search_collection')"
        class="w-full min-w-0 border-0 bg-transparent text-title3 text-ink outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
        @keydown="onKeydown"
      />
      <kbd class="rounded-4 border border-line px-6 py-2 font-[inherit] text-caption2 text-muted narrow:hidden"
        >esc</kbd
      >
    </label>
    <div
      id="palette-list"
      ref="list"
      role="listbox"
      :aria-label="t('search')"
      class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-8 py-8"
    >
      <p v-if="nothing" role="presentation" class="px-12 py-24 text-center text-footnote text-muted">
        {{ t('search_nothing', { query: query.trim() }) }}
      </p>
      <div
        v-for="section in sections"
        :key="section.id"
        role="group"
        :aria-labelledby="`palette-group-${section.id}`"
        class="pb-6"
      >
        <p
          :id="`palette-group-${section.id}`"
          role="presentation"
          class="px-12 pt-10 pb-6 text-caption2 font-semibold tracking-caps text-muted uppercase"
        >
          {{ section.title }}
        </p>
        <div
          v-for="option in section.options"
          :id="optionId(option)"
          :key="optionId(option)"
          role="option"
          :aria-selected="activeOption === option"
          class="flex cursor-pointer items-center gap-12 rounded-10 px-12 py-7 aria-selected:bg-selected"
          @pointermove="active = options.indexOf(option)"
          @click="activate(option)"
        >
          <template v-if="option.hit">
            <span
              v-if="hitIcon(option.hit)"
              aria-hidden="true"
              class="grid size-40 shrink-0 place-items-center rounded-8 bg-soft text-secondary"
            >
              <UiIcon :name="hitIcon(option.hit) ?? 'music'" class="size-18" />
            </span>
            <span
              v-else
              aria-hidden="true"
              class="relative size-40 shrink-0 overflow-hidden bg-soft"
              :class="option.hit.kind === 'artists' ? 'rounded-full' : 'rounded-6'"
            >
              <Artwork
                :title="hitTitle(option.hit)"
                :cover="hitCover(option.hit)"
                :artist="option.hit.kind === 'artists'"
              />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-body font-medium">{{ hitTitle(option.hit) }}</span>
              <span class="block truncate text-footnote text-muted">{{ hitLine(option.hit) }}</span>
            </span>
            <UiIcon
              v-if="option.hit.kind === 'tracks'"
              name="play"
              aria-hidden="true"
              class="size-16 shrink-0 text-muted"
            />
          </template>
          <template v-else>
            <span aria-hidden="true" class="grid size-32 shrink-0 place-items-center rounded-8 bg-soft text-secondary">
              <UiIcon :name="option.command.icon" class="size-16" />
            </span>
            <span class="min-w-0 flex-1 truncate text-body">{{ option.command.label }}</span>
          </template>
        </div>
      </div>
    </div>
    <footer class="flex items-center gap-16 border-t border-line px-20 py-10 text-caption text-muted narrow:hidden">
      <span v-for="hint in hints" :key="hint.label" class="flex items-center gap-4">
        <kbd v-for="key in hint.keys" :key="key" :class="KEY">{{ key }}</kbd>
        {{ hint.label }}
      </span>
      <button
        v-if="query.trim() && !nothing"
        type="button"
        class="ml-auto rounded-6 px-8 py-4 font-medium text-secondary hover:bg-hover hover:text-ink"
        @click="allResults"
      >
        {{ t('search_all') }} <kbd :class="KEY">{{ modifier }}↵</kbd>
      </button>
    </footer>
    <button
      v-if="query.trim() && !nothing"
      type="button"
      class="hidden border-t border-line px-20 py-14 text-center text-footnote font-medium text-secondary narrow:block"
      @click="allResults"
    >
      {{ t('search_all') }}
    </button>
  </dialog>
</template>
