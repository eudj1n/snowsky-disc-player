<script setup lang="ts">
/**
 * Top bar (owner, 2026-09-30): breadcrumbs, the search palette's button and
 * settings; on phones a search button that opens the search page and the
 * device button. The breadcrumbs replace the pages' back links: a page below a
 * section gives its place (views/crumbs.ts). Adding music went
 * to Card, the palette and the empty collection; refreshing to the palette and
 * the connection dialog; sound to the player; the language to Settings.
 * The sidebar toggle sits on the sidebar's edge (SidebarToggle).
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { t } from '../i18n'
import { openDialog, openPalette, pageCrumbs, type Crumb } from '../stores/ui'
import UiIcon from '../ui/UiIcon.vue'
import UiIconButton from '../ui/UiIconButton.vue'

const route = useRoute()
const crumbs = computed<Crumb[]>(() => pageCrumbs(route.path) ?? [])
const parent = computed(() => crumbs.value.at(-2) ?? null)
/** ⌘ on Apple keyboards, Ctrl elsewhere. */
const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'
</script>

<template>
  <header
    class="flex h-86 items-center gap-18 border-b border-line px-44 wide:h-94 compact:gap-14 compact:px-26 rail:gap-10 phone:h-65 phone:gap-4 phone:px-12 listening:gap-12 listening:px-24"
  >
    <!-- A section's own page has no trail: its heading names it. -->
    <nav v-if="crumbs.length > 1" :aria-label="t('breadcrumbs')" class="min-w-0 flex-1" data-testid="crumbs">
      <ol class="flex min-w-0 items-center gap-6 text-body phone:hidden">
        <li
          v-for="(crumb, index) in crumbs"
          :key="index"
          class="flex min-w-0 items-center gap-6"
          :class="index === crumbs.length - 1 ? 'shrink' : 'shrink-[4]'"
        >
          <UiIcon v-if="index" name="chevron" aria-hidden="true" class="size-14 shrink-0 -rotate-90 text-muted" />
          <RouterLink
            v-if="crumb.to && index < crumbs.length - 1"
            :to="crumb.to"
            class="truncate rounded-4 text-secondary underline-offset-3 hover:text-ink hover:underline"
            >{{ crumb.text }}</RouterLink
          >
          <span v-else aria-current="page" class="truncate font-semibold text-ink">{{ crumb.text }}</span>
        </li>
      </ol>
      <!-- Phones show only the step back. -->
      <RouterLink
        v-if="parent?.to"
        :to="parent.to"
        class="hidden max-w-full items-center gap-4 text-body text-secondary phone:inline-flex"
      >
        <UiIcon name="chevron" aria-hidden="true" class="size-16 shrink-0 rotate-90" />
        <span class="truncate">{{ parent.text }}</span>
      </RouterLink>
    </nav>
    <div v-else class="flex-1" />
    <button
      type="button"
      data-testid="search-open"
      :aria-label="t('search')"
      :aria-keyshortcuts="'/ Meta+K Control+K'"
      class="flex w-240 items-center gap-10 rounded-full bg-soft px-14 py-9 text-footnote text-muted transition-colors duration-150 hover:bg-hover hover:text-ink compact:w-180 rail:w-auto phone:hidden"
      @click="openPalette"
    >
      <UiIcon name="search" class="size-16 shrink-0" />
      <span class="flex-1 text-left rail:hidden">{{ t('search') }}</span>
      <kbd class="rounded-4 border border-line px-5 py-1 font-[inherit] text-caption2 rail:hidden">{{ shortcut }}</kbd>
    </button>
    <span class="hidden phone:contents">
      <UiIconButton icon="search" :label="t('search')" class="w-28" @click="$router.push({ name: 'search' })" />
      <UiIconButton icon="device" :label="t('disc_connection')" class="w-28" @click="openDialog('connection')" />
    </span>
    <UiIconButton icon="settings" :label="t('settings')" class="phone:w-28" @click="openDialog('settings')" />
  </header>
</template>
