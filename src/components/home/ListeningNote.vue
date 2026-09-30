<script setup lang="ts">
defineProps<{ eyebrow: string; titleLines: [string, string]; lines: [string, string] }>()
</script>

<template>
  <div class="relative min-h-175 overflow-hidden rounded-12 border border-line bg-soft p-25">
    <span class="text-caption2 font-semibold tracking-caps text-muted uppercase">{{ eyebrow }}</span>
    <h3 class="my-13 text-title2 font-bold tracking-heading">{{ titleLines[0] }}<br />{{ titleLines[1] }}</h3>
    <p class="m-0 max-w-[65%] text-footnote leading-[1.55] text-muted">{{ lines[0] }}<br />{{ lines[1] }}</p>
    <span
      aria-hidden="true"
      class="absolute top-60 -right-30 size-145 rounded-full border border-[var(--ring-edge)] shadow-[0_0_0_15px_var(--ring-a),0_0_0_16px_var(--ring-b),0_0_0_31px_var(--ring-c),0_0_0_32px_var(--ring-d)]"
    />
  </div>
</template>
