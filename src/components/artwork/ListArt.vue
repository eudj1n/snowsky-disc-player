<script setup lang="ts">
/**
 * An automatic playlist's cover (owner, 2026-09-30): see domain/listArt.ts.
 * Sized by its box through container units, so one component serves the
 * Home card, the list page's sleeve and a row's thumbnail (colour only).
 * Decorative: the card or heading around it names the list.
 */
import { computed } from 'vue'
import { titleSize } from '../../domain/listArt'

const props = withDefaults(
  defineProps<{ title: string; background: string; artists?: string | null; thumb?: boolean }>(),
  { artists: null, thumb: false },
)
const size = computed(() => `${String(titleSize(props.title))}cqw`)
</script>

<template>
  <div
    aria-hidden="true"
    class="@container relative size-full overflow-hidden text-white transition-[scale] duration-[800ms] ease-[cubic-bezier(.22,.61,.36,1)] group-hover:scale-[1.035] group-focus-visible:scale-[1.035] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
    :style="{ background }"
    data-testid="list-art"
  >
    <template v-if="!thumb">
      <span class="absolute top-[6cqw] right-[7cqw] text-[6.5cqw] leading-none font-bold tracking-[-0.03em] opacity-90"
        >disc.</span
      >
      <span
        class="absolute inset-x-[8cqw] top-1/2 -translate-y-1/2 text-center leading-[1.04] font-bold tracking-[-0.035em] text-balance [text-shadow:0_2px_14px_#0003]"
        :style="{ fontSize: size }"
        >{{ title }}</span
      >
      <span
        v-if="artists"
        class="absolute inset-x-[7cqw] bottom-[6cqw] line-clamp-2 text-[4.6cqw] leading-[1.3] font-medium opacity-95"
        >{{ artists }}</span
      >
    </template>
  </div>
</template>
