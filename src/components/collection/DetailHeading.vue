<script setup lang="ts">
/** Reference detail header: 220px sleeve beside a column of the same height
 * (owner, 2026-09-28, after the Yandex Music album header): the kind of page
 * at its top edge, the name sized by its length and the meta line, the
 * actions on its bottom edge; a longer column grows past the sleeve. Two
 * colours of the cover (owner, 2026-09-30; domain/coverColours.ts), else of
 * the sleeve palette, fitted to the theme, run as a gradient behind it into
 * the page, and a quiet rule separates it from the content below. Once the header has scrolled away, a compact bar keeps the
 * page's context at the top: small cover, name (back to the top), the
 * `sticky` slot's line and one play/pause button (owner, round 14, option A).
 * The `artwork` slot replaces the sleeve in both places (a genre's records). */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { sleeve, SLEEVE_TONES } from '../../domain/artwork'
import { hex, tint, toLch, type CoverColours, type Rgb } from '../../domain/coverColours'
import { t } from '../../i18n'
import UiIcon from '../../ui/UiIcon.vue'
import Artwork from '../artwork/Artwork.vue'
import type { HeadingAction } from './headingAction'

const props = withDefaults(
  defineProps<{
    title: string
    /** What the page shows ("Album", "Artist"...), above the name. */
    kind?: string | null
    artist?: boolean
    cover?: Blob | null
    stickyAction?: HeadingAction | null
  }>(),
  {
    kind: null,
    artist: false,
    cover: null,
    stickyAction: null,
  },
)
/** Longer names step down so the column keeps the sleeve's height in the usual cases. */
const titleSize = computed(() => {
  const length = props.title.length
  return length <= 20 ? 'text-large tracking-title' : 'text-title1 tracking-title'
})
/** `cover`: show the observed cover (or artist picture) in full size. */
const emit = defineEmits<{ sticky: []; cover: [] }>()
const observed = ref<CoverColours | null>(null)
watch(
  () => props.cover,
  (cover) => {
    if (!cover) observed.value = null
  },
)
/** A sleeve's label colour and a lighter neighbour of it, for pages without a cover. */
function sleeveColoursOf(title: string): CoverColours {
  const label = SLEEVE_TONES[sleeve(title).palette] ?? SLEEVE_TONES[0]
  const rgb = [1, 3, 5].map((at) => parseInt(label.slice(at, at + 2), 16)) as unknown as Rgb
  const first = toLch(rgb)
  return { first, second: { ...first, L: Math.min(0.9, first.L + 0.15), h: first.h + 0.35 }, grey: first.C < 0.035 }
}
/** The gradient's colours for both themes; the stylesheet picks the theme's pair. */
const colours = computed(() => {
  const { first, second } = observed.value ?? sleeveColoursOf(props.title)
  return {
    '--head-a': hex(tint(first, 'light')),
    '--head-b': hex(tint(second, 'light', 0.85)),
    '--head-a-dark': hex(tint(first, 'dark')),
    '--head-b-dark': hex(tint(second, 'dark', 0.85)),
  }
})

/** The compact bar's height: the header counts as gone once it has scrolled under it. */
const BAR = 62
/** The header has scrolled above the viewport (under the bar): the compact bar shows. */
const heading = ref<HTMLElement | null>(null)
const stuck = ref(false)
let observer: IntersectionObserver | null = null
watch(heading, (element) => {
  observer?.disconnect()
  observer = null
  stuck.value = false
  if (!element || typeof IntersectionObserver !== 'function') return
  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries.at(-1)
      if (entry)
        stuck.value = !entry.isIntersecting && entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? BAR)
    },
    { rootMargin: `-${BAR}px 0px 0px 0px` },
  )
  observer.observe(element)
})
onBeforeUnmount(() => observer?.disconnect())

function toTop(): void {
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' })
}
</script>

<template>
  <div
    ref="heading"
    class="relative isolate mt-25 mb-26 flex items-start gap-30 border-b border-line pb-30 rail:gap-22 phone:mt-23 phone:mb-20 phone:block phone:pb-23 phone:text-center"
    :style="colours"
  >
    <span
      aria-hidden="true"
      data-testid="album-colours"
      class="album-colours pointer-events-none absolute -inset-x-40 -top-70 bottom-0 -z-10 wide:-inset-x-56 compact:-inset-x-24 phone:-inset-x-16 listening:-inset-x-28"
    />
    <div
      class="aspect-square w-220 shrink-0 overflow-hidden shadow-[0_12px_40px_#25341515] rail:w-165 phone:mx-auto phone:mb-25 phone:w-200"
      :class="artist ? 'rounded-full' : 'rounded-12'"
    >
      <slot name="artwork">
        <!-- An observed cover (or artist picture) opens in full size; the typographic sleeve does not. -->
        <button
          v-if="cover"
          type="button"
          class="group block size-full cursor-zoom-in p-0"
          :aria-label="t('cover_full_size', { name: title })"
          data-testid="cover-open"
          @click="emit('cover')"
        >
          <Artwork :title="title" :artist="artist" :cover="cover" tone @tone="(color) => (observed = color)" />
        </button>
        <Artwork v-else :title="title" :artist="artist" :cover="cover" tone @tone="(color) => (observed = color)" />
      </slot>
    </div>
    <!-- As tall as the sleeve: the kind on its top edge, the actions on its bottom edge. -->
    <div class="flex min-h-220 min-w-0 flex-1 flex-col rail:min-h-165 phone:min-h-0">
      <p v-if="kind" class="m-0 mb-10 text-body leading-none font-medium text-secondary" data-testid="heading-kind">
        {{ kind }}
      </p>
      <h1 class="mt-0 mb-12 leading-[1.08] font-bold [overflow-wrap:anywhere]" :class="titleSize">
        {{ title }}
      </h1>
      <p class="m-0 text-body text-muted"><slot name="meta" /></p>
      <!-- Actions wrap to a new line on narrow screens rather than widen the page. -->
      <div
        class="mt-auto flex flex-wrap items-center gap-10 pt-20 empty:hidden phone:mt-0 phone:justify-center [&>*]:whitespace-nowrap"
      >
        <slot />
      </div>
    </div>
    <!-- In the workspace, so it follows the sidebar and an open listening panel. -->
    <Teleport defer to="#workspace">
      <Transition
        enter-active-class="transition-[translate,opacity] duration-200 motion-reduce:transition-none"
        leave-active-class="transition-[translate,opacity] duration-150 motion-reduce:transition-none"
        enter-from-class="-translate-y-full opacity-0"
        leave-to-class="-translate-y-full opacity-0"
      >
        <div
          v-if="stuck"
          role="region"
          :aria-label="title"
          data-testid="sticky-heading"
          class="fixed top-0 right-0 left-(--sidebar) z-20 border-b border-line bg-paper/92 shadow-[0_6px_22px_#0000000f] backdrop-blur-[14px] listening:right-380"
        >
          <div
            class="mx-auto flex h-62 max-w-1680 items-center gap-14 px-44 wide:px-60 compact:px-26 phone:h-56 phone:gap-11 phone:px-18 listening:px-30"
          >
            <span class="size-40 shrink-0 overflow-hidden phone:size-36" :class="artist ? 'rounded-full' : 'rounded-6'">
              <slot name="artwork"><Artwork :title="title" :artist="artist" :cover="cover" /></slot>
            </span>
            <div class="min-w-0 flex-1">
              <button
                type="button"
                class="block max-w-full truncate p-0 text-left text-callout font-bold tracking-heading hover:underline hover:underline-offset-3"
                @click="toTop"
              >
                {{ title }}
              </button>
              <p v-if="$slots.sticky" class="m-0 mt-3 truncate text-footnote text-muted"><slot name="sticky" /></p>
            </div>
            <button
              v-if="stickyAction"
              type="button"
              :aria-label="stickyAction.label"
              :title="stickyAction.label"
              :disabled="stickyAction.disabled"
              class="grid size-40 shrink-0 place-items-center rounded-full bg-strong p-0 text-strong-ink hover:enabled:bg-strong-hover phone:size-36"
              @click="emit('sticky')"
            >
              <UiIcon filled :name="stickyAction.icon" class="size-15 stroke-[1.5]" />
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
