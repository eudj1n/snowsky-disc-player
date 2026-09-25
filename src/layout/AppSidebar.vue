<script setup lang="ts">
/**
 * Reference sidebar: brand, caption, navigation, note and the device card.
 * It collapses to an icon rail at 800px and becomes the bottom navigation on
 * phones, where the device card moves to the top bar.
 */
import { useRoute } from 'vue-router'
import BrandLogo from '../components/brand/BrandLogo.vue'
import { t } from '../i18n'
import { SECTIONS, sectionOf } from '../router'
import { connection } from '../stores/connection'
import { openDialog } from '../stores/ui'
import UiIcon from '../ui/UiIcon.vue'

const route = useRoute()
const label = () =>
  connection.gateway === false
    ? t('server_unavailable')
    : t(
        connection.connection === 'connected'
          ? 'connected'
          : connection.connection === 'connecting'
            ? 'connecting'
            : 'disconnected',
      )
</script>

<template>
  <aside
    :aria-label="t('main_navigation')"
    class="fixed top-0 bottom-(--player) left-0 z-15 flex w-(--sidebar) flex-col overflow-y-auto border-r border-line bg-surface px-20 pt-36 pb-18 compact:px-12 compact:pt-30 compact:pb-15 rail:px-10 rail:pt-26 phone:inset-x-0 phone:top-auto phone:bottom-0 phone:z-35 phone:block phone:h-58 phone:w-full phone:overflow-visible phone:border-t phone:border-r-0 phone:p-0"
  >
    <BrandLogo :label="t('disc_home')" />
    <span
      class="px-12 pt-18 pb-38 text-8 font-bold tracking-[1.7px] text-muted compact:text-7 compact:tracking-[1px] rail:hidden"
      >YOUR MUSIC. YOUR SPACE.</span
    >
    <nav class="rail:mt-35 phone:m-0 phone:flex phone:h-full phone:justify-around">
      <template v-for="section in SECTIONS" :key="section.name">
        <p
          v-if="section.name === 'albums'"
          class="mx-14 mt-30 mb-13 text-9 font-bold tracking-[1.6px] text-muted rail:hidden phone:hidden"
        >
          {{ t('my_collection') }}
        </p>
        <RouterLink
          :to="section.path"
          :aria-current="sectionOf(route.name) === section.name ? 'page' : undefined"
          :class="{ 'phone:hidden': 'phone' in section }"
          class="group my-3 flex w-full items-center gap-12 rounded-9 px-14 py-13 text-left font-[550] text-muted hover:bg-hover hover:text-ink aria-[current=page]:bg-selected aria-[current=page]:text-ink rail:mb-10 rail:justify-center rail:gap-0 rail:p-14 rail:text-[0px] phone:m-0 phone:w-auto phone:flex-1 phone:flex-col phone:gap-4 phone:rounded-none phone:px-4 phone:py-8 phone:text-7 phone:font-medium phone:aria-[current=page]:bg-transparent phone:aria-[current=page]:text-secondary"
        >
          <UiIcon :name="section.icon" class="group-aria-[current=page]:text-secondary phone:size-19" />
          <span>{{ t(section.title) }}</span>
        </RouterLink>
      </template>
    </nav>
    <div
      class="mt-auto flex items-center gap-12 px-14 pt-24 pb-26 text-11 leading-[1.6] text-muted compact:px-10 compact:py-20 compact:text-10 rail:hidden short:hidden"
    >
      <span
        aria-hidden="true"
        class="relative inline-block size-27 shrink-0 rounded-full border border-current after:absolute after:top-1/2 after:left-1/2 after:size-9 after:-translate-1/2 after:rounded-full after:border after:border-current"
      />
      <p class="my-[1em]">{{ t('good_music') }}<br />{{ t('always_within_reach') }}</p>
    </div>
    <button
      type="button"
      :aria-label="t('disc_connection')"
      class="flex items-center gap-10 rounded-11 border border-line bg-raised px-10 py-13 text-left compact:gap-7 compact:px-8 compact:py-12 rail:mt-auto rail:justify-center rail:border-0 rail:bg-transparent rail:p-12 phone:hidden short:mt-auto"
      @click="openDialog('connection')"
    >
      <UiIcon name="device" class="size-27" />
      <span class="rail:hidden">
        <strong class="block text-10 tracking-[0.5px] compact:text-9">SNOWSKY DISC</strong>
        <small class="mt-5 block text-10 text-muted">{{ label() }}</small>
      </span>
      <span
        aria-hidden="true"
        class="ml-auto size-6 shrink-0 rounded-full rail:hidden"
        :class="
          connection.connection === 'connected'
            ? 'bg-[#82a773] shadow-[0_0_0_3px_#e8eedf] dark:shadow-[0_0_0_3px_#2f3e27]'
            : 'bg-[#a7a89e]'
        "
      />
    </button>
  </aside>
</template>
