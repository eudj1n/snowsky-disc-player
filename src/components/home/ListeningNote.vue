<script setup lang="ts">
defineProps<{ eyebrow: string; titleLines: [string, string]; lines: [string, string] }>()
</script>

<template>
  <div class="relative min-h-175 overflow-hidden rounded-12 border border-line bg-soft p-25">
    <span class="text-9 font-[650] tracking-[1.8px] text-muted uppercase">{{ eyebrow }}</span>
    <h3 class="my-13 text-21 leading-[1.2] font-bold tracking-[-0.6px]">
      {{ titleLines[0] }}<br />{{ titleLines[1] }}
    </h3>
    <p class="m-0 max-w-[65%] text-11 leading-[1.7] text-muted">{{ lines[0] }}<br />{{ lines[1] }}</p>
    <span
      aria-hidden="true"
      class="absolute top-60 -right-30 size-145 rounded-full border border-[#ced6ba] shadow-[0_0_0_15px_#dce2d0,0_0_0_16px_#cad4b6,0_0_0_31px_#e5e9db,0_0_0_32px_#d3dcc4] dark:border-[#3c4c33] dark:shadow-[0_0_0_15px_#2b3625,0_0_0_16px_#3c4c33,0_0_0_31px_#242f20,0_0_0_32px_#3c4c33]"
    />
  </div>
</template>
