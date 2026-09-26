<script setup lang="ts">
/**
 * Reference top bar: breadcrumb, search (focused by "/"), a quiet Add music
 * button, refresh, the device button on phones, appearance, sound settings
 * and language.
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { chooseLocale, locale, t, type Locale, type MessageKey } from '../i18n'
import { SECTIONS, sectionOf } from '../router'
import { appearance } from '../stores/appearance'
import { library, loadCollection } from '../stores/library'
import { imports } from '../stores/imports'
import { openDialog, setQuery, ui } from '../stores/ui'
import UiIcon from '../ui/UiIcon.vue'
import UiIconButton from '../ui/UiIconButton.vue'

const route = useRoute()
const section = computed(() => SECTIONS.find((item) => item.name === sectionOf(route.name)) ?? SECTIONS[0])
const SEARCH: Record<string, MessageKey> = {
  home: 'search_albums',
  albums: 'search_albums',
  artists: 'search_artists',
  genres: 'search_genres',
  playlists: 'search_playlists',
}
const placeholder = computed(() => t(SEARCH[String(route.name)] ?? 'search_tracks'))
const appearanceTitle = computed(() => t('appearance_label') + t(`${appearance.value}_label`))
const importActive = computed(() => imports.transferring || imports.scan.phase === 'scanning')
const language = computed<Locale>({ get: () => locale.value, set: chooseLocale })
</script>

<template>
  <header
    class="flex h-86 items-center gap-22 border-b border-line px-44 wide:h-94 compact:gap-15 compact:px-26 rail:gap-10 phone:h-65 phone:gap-5 phone:px-12 listening:gap-12 listening:px-24"
  >
    <div class="text-11 font-semibold tracking-[1px] whitespace-nowrap max-[900px]:hidden">
      SNOWSKY <span class="mx-14 text-muted/50">/</span>
      <strong class="font-medium tracking-normal text-muted">{{ t(section.title) }}</strong>
    </div>
    <!-- Search takes the free width between the breadcrumb and the actions (owner, round 9). -->
    <label
      class="flex max-w-720 min-w-0 flex-1 items-center gap-10 rounded-8 bg-soft px-13 py-10 text-muted focus-within:shadow-[0_0_0_2px_var(--focus-ring)] phone:max-w-none phone:px-10 phone:py-9"
    >
      <UiIcon name="search" class="size-16" />
      <input
        id="search"
        type="search"
        autocomplete="off"
        :placeholder="placeholder"
        :aria-label="placeholder"
        :value="ui.query"
        class="w-full min-w-0 border-0 bg-transparent text-11 text-ink outline-none phone:text-11"
        @input="setQuery(($event.target as HTMLInputElement).value)"
      />
      <kbd class="rounded-3 border border-line px-5 py-1 font-[inherit] text-11 phone:hidden">/</kbd>
    </label>
    <button
      type="button"
      :aria-label="t('import_music')"
      :title="t('import_music')"
      class="ml-auto flex items-center justify-center gap-7 rounded-24 px-12 py-8 text-11 whitespace-nowrap text-secondary transition-colors duration-150 hover:bg-hover hover:text-ink compact:p-8 listening:p-8"
      @click="openDialog('import')"
    >
      <UiIcon name="add-music" class="size-18" />
      <span class="compact:hidden listening:hidden">{{ t('import_music') }}</span>
      <i v-if="importActive" aria-hidden="true" class="size-7 rounded-full bg-accent" />
    </button>
    <UiIconButton
      icon="refresh"
      :label="t('refresh_collection')"
      :disabled="library.status === 'loading'"
      class="phone:w-28 data-[busy=true]:[&>svg]:animate-sync-rotate"
      :data-busy="library.status === 'loading'"
      @click="loadCollection(true)"
    />
    <span class="hidden phone:contents">
      <UiIconButton icon="device" :label="t('disc_connection')" class="w-28" @click="openDialog('connection')" />
    </span>
    <UiIconButton icon="moon" :label="appearanceTitle" class="phone:w-28" @click="openDialog('appearance')" />
    <UiIconButton icon="sliders" :label="t('sound_title')" class="phone:w-28" @click="openDialog('sound')" />
    <label>
      <span class="sr-only">{{ t('language') }}</span>
      <select
        v-model="language"
        :aria-label="t('language')"
        class="rounded-7 border border-line bg-soft px-5 py-7 text-11 text-secondary phone:px-3 phone:py-6 phone:text-10"
      >
        <option value="ru">RU</option>
        <option value="en">EN</option>
      </select>
    </label>
  </header>
</template>
