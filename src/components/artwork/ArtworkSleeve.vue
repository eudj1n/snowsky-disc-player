<script setup lang="ts">
/**
 * Typographic placeholder for an album, artist, playlist or track without
 * observed artwork (reference .card-placeholder). Decorative: hidden from
 * assistive technology. Motion reacts to an ancestor with the `group` class.
 */
import { computed } from 'vue'
import { sleeve } from '../../domain/artwork'

const props = withDefaults(defineProps<{ title: string | null; artist?: boolean }>(), { artist: false })
const shape = computed(() => sleeve(props.title))

// Palette classes stay literal so Tailwind can see them.
const PALETTES = [
  '[--deep:#234b49] [--mid:#638a78] [--glow:#d6cf9b]',
  '[--deep:#503544] [--mid:#ac746c] [--glow:#ebc69e]',
  '[--deep:#2f385a] [--mid:#768ba6] [--glow:#ced6d0]',
  '[--deep:#624229] [--mid:#b18b54] [--glow:#eadba8]',
  '[--deep:#443854] [--mid:#8a739a] [--glow:#debbbd]',
  '[--deep:#344432] [--mid:#84906b] [--glow:#d8d8b0]',
] as const
</script>

<template>
  <div
    aria-hidden="true"
    class="@container relative isolate size-full overflow-hidden bg-[radial-gradient(ellipse_at_8%_0%,var(--glow),transparent_65%),linear-gradient(145deg,var(--mid),var(--deep)_85%)] text-[#fff8e9] transition-[scale,filter] duration-[800ms] ease-[cubic-bezier(.22,.61,.36,1)] will-change-transform group-hover:scale-[1.035] group-hover:saturate-[1.12] group-focus-visible:scale-[1.035] group-focus-visible:saturate-[1.12] after:pointer-events-none after:absolute after:inset-0 after:z-3 after:bg-[repeating-linear-gradient(0deg,#fff1_0px,transparent_1px,transparent_4px)] after:opacity-22 after:shadow-[inset_0_0_0_1px_#fff2] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
    :class="PALETTES[shape.palette]"
  >
    <span
      class="absolute rounded-full border border-[#fff5] shadow-[0_0_0_9px_#fff1,0_0_0_10px_#fff2,0_0_0_24px_#fff1,0_0_0_25px_#fff2] transition-transform duration-700 group-hover:translate-x-[-6%] group-hover:translate-y-[9%] group-focus-visible:translate-x-[-6%] group-focus-visible:translate-y-[9%]"
      :class="artist ? 'top-[18%] left-[18%] size-[64%]' : 'top-[-29%] left-[35%] size-[93%]'"
    />
    <span
      class="absolute font-sleeve leading-none font-normal tracking-[-0.14em] whitespace-nowrap text-[#fff4dc] opacity-27 transition-[transform,translate,scale,rotate,opacity] duration-700 group-hover:translate-y-[-3%] group-hover:rotate-[-8deg] group-hover:opacity-40 group-focus-visible:translate-y-[-3%] group-focus-visible:rotate-[-8deg] group-focus-visible:opacity-40"
      :class="
        artist
          ? 'bottom-[-8%] left-0 rotate-[-8deg] text-[95cqw]'
          : 'bottom-[-24%] left-[-12%] rotate-[-14deg] text-[113cqw]'
      "
      >{{ shape.letters }}</span
    >
  </div>
</template>
