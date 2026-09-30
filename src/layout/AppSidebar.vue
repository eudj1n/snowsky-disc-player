<script setup lang="ts">
/**
 * Reference sidebar: brand, caption, navigation, note and the device card.
 * It collapses to an icon rail at 800px, or wider when the top bar's toggle
 * asks for it (slim variant), and becomes the bottom navigation on phones,
 * where the device card moves to the top bar.
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import BrandLogo from '../components/brand/BrandLogo.vue'
import { t } from '../i18n'
import { SECTIONS, sectionOf } from '../router'
import { connection } from '../stores/connection'
import { imports } from '../stores/imports'
import { railShown } from '../stores/sidebar'
import { openDialog } from '../stores/ui'
import UiIcon from '../ui/UiIcon.vue'

const route = useRoute()
/** Music on its way to the card or being scanned: a dot on Card (it left the top bar, 2026-09-30). */
const importActive = computed(() => imports.transferring || imports.scan.phase === 'scanning')
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
    class="fixed top-0 bottom-(--player) left-0 z-15 flex w-(--sidebar) flex-col overflow-y-auto border-r border-line bg-surface px-20 pt-36 pb-18 compact:px-12 compact:pt-30 compact:pb-15 slim:px-10 slim:pt-26 phone:inset-x-0 phone:top-auto phone:bottom-0 phone:z-35 phone:block phone:h-58 phone:w-full phone:overflow-visible phone:border-t phone:border-r-0 phone:p-0"
  >
    <BrandLogo :label="t('disc_home')" />
    <span
      class="px-12 pt-18 pb-38 text-[8px] font-bold tracking-[1.7px] text-muted compact:text-[7px] compact:tracking-[1px] slim:hidden"
      >YOUR MUSIC. YOUR SPACE.</span
    >
    <nav class="slim:mt-55 wide:slim:mt-63 phone:m-0 phone:flex phone:h-full phone:justify-around">
      <template v-for="section in SECTIONS" :key="section.name">
        <p
          v-if="section.name === 'albums' || section.name === 'card'"
          class="mx-14 mt-30 mb-13 text-caption2 font-semibold tracking-caps text-muted slim:hidden phone:hidden"
        >
          {{ t(section.name === 'card' ? 'your_player' : 'my_collection') }}
        </p>
        <RouterLink
          :to="section.path"
          :title="railShown ? t(section.title) : undefined"
          :aria-current="sectionOf(route.name) === section.name ? 'page' : undefined"
          :class="{ 'phone:hidden': 'phone' in section }"
          class="group relative my-3 flex w-full items-center gap-12 rounded-9 px-14 py-13 text-left font-medium text-ink hover:bg-hover hover:text-ink aria-[current=page]:bg-selected aria-[current=page]:font-semibold aria-[current=page]:text-ink slim:mb-10 slim:justify-center slim:gap-0 slim:p-14 slim:text-[0px] phone:m-0 phone:w-auto phone:flex-1 phone:flex-col phone:gap-4 phone:rounded-none phone:px-4 phone:py-8 phone:text-[10px] phone:font-medium phone:text-muted phone:aria-[current=page]:bg-transparent phone:aria-[current=page]:text-secondary"
        >
          <!-- Links in the ink, icons quieter, the current section's icon in the accent (owner, 2026-09-30, option B);
               the phone's tab bar keeps quiet labels. -->
          <UiIcon
            :name="section.icon"
            class="text-secondary group-aria-[current=page]:text-accent phone:size-19 phone:text-current"
          />
          <span>{{ t(section.title) }}</span>
          <template v-if="section.name === 'card' && importActive">
            <span class="sr-only">, {{ t('import_workflow') }}</span>
            <i
              aria-hidden="true"
              data-testid="card-import-dot"
              class="ml-auto size-7 shrink-0 rounded-full bg-accent slim:absolute slim:top-10 slim:right-10 slim:ml-0"
            />
          </template>
        </RouterLink>
      </template>
    </nav>
    <button
      type="button"
      :aria-label="t('disc_connection')"
      class="mt-auto flex items-center gap-10 rounded-11 border border-line bg-raised px-10 py-13 text-left compact:gap-7 compact:px-8 compact:py-12 slim:justify-center slim:border-0 slim:bg-transparent slim:p-12 phone:hidden"
      @click="openDialog('connection')"
    >
      <UiIcon name="device" class="size-27" />
      <span class="slim:hidden">
        <strong class="block truncate text-footnote compact:text-caption">SNOWSKY DISC</strong>
        <small class="mt-5 block text-footnote text-muted">{{ label() }}</small>
      </span>
      <span
        aria-hidden="true"
        class="ml-auto size-6 shrink-0 rounded-full slim:hidden"
        :class="
          connection.connection === 'connected' ? 'bg-[#82a773] shadow-[0_0_0_3px_var(--online-ring)]' : 'bg-[#a7a89e]'
        "
      />
    </button>
  </aside>
</template>
