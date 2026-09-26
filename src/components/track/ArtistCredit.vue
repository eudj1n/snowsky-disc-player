<script setup lang="ts">
/** A track's artist credit: one link per artist of a joint credit ("A; B"), commas between. */
import type { RouteLocationRaw } from 'vue-router'
import { creditArtists } from '../../domain/artist'

defineProps<{ credit: string; to: (name: string) => RouteLocationRaw | null; linkClass?: string }>()
</script>

<template>
  <template v-for="(name, index) in creditArtists(credit)" :key="name"
    ><template v-if="index">, </template
    ><RouterLink v-if="to(name)" :to="to(name) ?? ''" :class="linkClass">{{ name }}</RouterLink
    ><template v-else>{{ name }}</template></template
  >
</template>
