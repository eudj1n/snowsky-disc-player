<script setup lang="ts">
/**
 * The "disc." word mark: a ringed disc and the word with a coral period. The
 * sidebar carries it; on phones, where the sidebar is the tab bar, the top
 * bar carries a smaller one on a section's own page (owner, 2026-09-30).
 */
withDefaults(defineProps<{ label: string; place?: 'sidebar' | 'topbar' }>(), { place: 'sidebar' })
</script>

<template>
  <a
    href="#/"
    :aria-label="label"
    class="flex items-center leading-none font-bold"
    :class="
      place === 'topbar'
        ? 'hidden gap-7 text-[29px] tracking-[-2px] phone:flex'
        : 'gap-10 px-12 text-[43px] tracking-[-3px] compact:text-[38px] slim:px-10 phone:hidden'
    "
    :data-testid="place === 'topbar' ? 'topbar-logo' : undefined"
  >
    <span
      aria-hidden="true"
      class="relative inline-block shrink-0 rounded-full border-current after:absolute after:top-1/2 after:left-1/2 after:-translate-1/2 after:rounded-full after:border-current"
      :class="
        place === 'topbar'
          ? 'size-23 border-[1.5px] after:size-8 after:border-[1.5px]'
          : 'size-34 border-2 after:size-12 after:border-2 slim:size-30'
      "
    />
    <span :class="{ 'slim:hidden': place === 'sidebar' }">disc<span class="text-accent">.</span></span>
  </a>
</template>
