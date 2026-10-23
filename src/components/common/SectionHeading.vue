<script setup lang="ts">
/**
 * Reference .section-heading: title with optional small subtitle and an action. A `hint` (owner,
 * 2026-10-23: the ListenBrainz sections' provenance was too much text) stays behind a small info
 * button beside the title, shown as the subtitle while pressed.
 */
import { ref } from 'vue'
import UiIcon from '../../ui/UiIcon.vue'

defineProps<{ title: string; subtitle?: string; hint?: string }>()
const hinted = ref(false)
</script>

<template>
  <div class="mt-31 mb-18 flex items-center justify-between gap-10 wide:mt-38 phone:mt-26">
    <div class="min-w-0">
      <div class="flex items-center gap-8">
        <h2 class="m-0 text-title2 font-bold tracking-heading">{{ title }}</h2>
        <button
          v-if="hint"
          type="button"
          class="flex size-22 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink aria-pressed:text-ink"
          :title="hint"
          :aria-label="hint"
          :aria-pressed="hinted"
          data-testid="section-hint"
          @click="hinted = !hinted"
        >
          <UiIcon name="info" class="size-14" />
        </button>
      </div>
      <small
        v-if="subtitle || (hint && hinted)"
        class="mt-7 block text-footnote font-normal tracking-normal text-muted"
        data-testid="section-subtitle"
        >{{ subtitle || hint }}</small
      >
    </div>
    <slot />
  </div>
</template>
