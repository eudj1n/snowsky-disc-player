<script setup lang="ts">
/**
 * Reference top bar: breadcrumb, search (focused by "/"), refresh, the
 * device button on phones, appearance and language. Add music and sound
 * settings join when their features land (plan M4, M5).
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { chooseLocale, locale, t, type Locale, type MessageKey } from '../i18n'
import { SECTIONS, sectionOf } from '../router'
import { appearance } from '../stores/appearance'
import { library, loadCollection } from '../stores/library'
import { openDialog, setQuery, ui } from '../stores/ui'
import UiIcon from '../ui/UiIcon.vue'
import UiIconButton from '../ui/UiIconButton.vue'

const route = useRoute()
const section = computed(() => SECTIONS.find((item) => item.name === sectionOf(route.name)) ?? SECTIONS[0])
const SEARCH: Record<string, MessageKey> = {
  home: 'search_albums',
  albums: 'search_albums',
  artists: 'search_artists',
  playlists: 'search_playlists',
}
const placeholder = computed(() => t(SEARCH[String(route.name)] ?? 'search_tracks'))
const appearanceTitle = computed(() => t('appearance_label') + t(`${appearance.value}_label`))
const language = computed<Locale>({ get: () => locale.value, set: chooseLocale })
</script>

<template>
  <header
    class="flex h-86 items-center gap-22 border-b border-line px-44 wide:h-94 compact:gap-15 compact:px-26 rail:gap-10 phone:h-65 phone:gap-5 phone:px-12 listening:gap-12 listening:px-24"
  >
    <div class="text-10 font-semibold tracking-[1px] whitespace-nowrap phone:hidden listening:hidden">
      SNOWSKY <span class="mx-14 text-[#c3c4b9]">/</span>
      <strong class="font-medium tracking-normal text-[#85877c]">{{ t(section.title) }}</strong>
    </div>
    <label
      class="ml-auto flex w-275 items-center gap-10 rounded-8 bg-soft px-13 py-10 text-muted focus-within:shadow-[0_0_0_2px_#abb99a] rail:w-210 phone:ml-0 phone:w-full phone:min-w-0 phone:px-10 phone:py-9 listening:min-w-0"
    >
      <UiIcon name="search" class="size-16" />
      <input
        id="search"
        type="search"
        autocomplete="off"
        :placeholder="placeholder"
        :aria-label="placeholder"
        :value="ui.query"
        class="w-full min-w-0 border-0 bg-transparent text-11 text-ink outline-none phone:text-10"
        @input="setQuery(($event.target as HTMLInputElement).value)"
      />
      <kbd class="rounded-3 border border-line px-5 py-1 font-[inherit] text-10 phone:hidden">/</kbd>
    </label>
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
    <label>
      <span class="sr-only">{{ t('language') }}</span>
      <select
        v-model="language"
        :aria-label="t('language')"
        class="rounded-7 border border-line bg-soft px-5 py-7 text-10 text-secondary phone:px-3 phone:py-6 phone:text-9"
      >
        <option value="ru">RU</option>
        <option value="en">EN</option>
      </select>
    </label>
    <span
      class="flex items-center gap-7 text-8 tracking-[1.1px] whitespace-nowrap text-muted compact:hidden listening:hidden"
    >
      WEB <span class="size-3 rounded-full bg-current" /> PREVIEW
    </span>
  </header>
</template>
