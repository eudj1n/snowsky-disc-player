<script setup lang="ts">
/**
 * The sidebar toggle (owner, 2026-09-28, after Reddit): a round button on the
 * sidebar's edge, centred where it meets the top bar's bottom line (owner,
 * 2026-09-29), that stays in place while the page scrolls. Windows of 800px and less always show the rail, so the
 * button is not offered there. It sits above the compact context bar (z-20)
 * and below the listening panel (z-25).
 */
import { t } from '../i18n'
import { sidebarRail, toggleSidebar } from '../stores/sidebar'
import UiIcon from '../ui/UiIcon.vue'
</script>

<template>
  <button
    type="button"
    :aria-label="t(sidebarRail ? 'sidebar_expand' : 'sidebar_collapse')"
    :title="t(sidebarRail ? 'sidebar_expand' : 'sidebar_collapse')"
    :aria-expanded="!sidebarRail"
    class="fixed top-[85.5px] left-(--sidebar) z-21 grid size-32 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-line bg-paper text-secondary shadow-[0_2px_8px_#0000001f] transition-colors duration-150 hover:bg-hover hover:text-ink wide:top-[93.5px] rail:hidden"
    data-testid="sidebar-toggle"
    @click="toggleSidebar"
  >
    <UiIcon :name="sidebarRail ? 'sidebar-expand' : 'sidebar-collapse'" class="size-16" />
  </button>
</template>
