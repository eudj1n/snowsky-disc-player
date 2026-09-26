<script setup lang="ts">
/** A track's artist credit: one link per artist of a joint credit ("A; B"), shown as "A & B". */
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { creditArtists, creditSeparator } from '../../domain/artist'

const props = defineProps<{ credit: string; to: (name: string) => RouteLocationRaw | null; linkClass?: string }>()
const names = computed(() => creditArtists(props.credit))
</script>

<template>
  <template v-for="(name, index) in names" :key="name"
    >{{ creditSeparator(index, names.length)
    }}<RouterLink v-if="to(name)" :to="to(name) ?? ''" :class="linkClass">{{ name }}</RouterLink
    ><template v-else>{{ name }}</template></template
  >
</template>
