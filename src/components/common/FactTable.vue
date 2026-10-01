<script setup lang="ts">
/**
 * Facts as label and value rows (owner, 2026-10-02: the album's and artist's
 * details take the track facts' table, not elements of their own): the same
 * caps heading, grid, rules and colours as TrackFacts. A value is a run of
 * parts joined by " · ": text, an outside link, or an action the parent runs.
 */
import type { FactRow } from './facts'

defineProps<{ heading: string; rows: readonly FactRow[] }>()
const emit = defineEmits<{ action: [id: string] }>()
const LINK = 'text-secondary underline-offset-3 hover:text-ink hover:underline'
</script>

<template>
  <section :aria-label="heading" data-testid="fact-table">
    <h3 class="mt-0 mb-8 text-caption2 font-semibold tracking-caps text-muted uppercase">{{ heading }}</h3>
    <dl class="m-0 grid grid-cols-[minmax(92px,auto)_minmax(0,1fr)] text-footnote">
      <template v-for="row in rows" :key="row.key">
        <dt class="border-t border-line/70 py-7 pr-14 text-muted">{{ row.label }}</dt>
        <dd
          class="m-0 min-w-0 border-t border-line/70 py-7 [overflow-wrap:anywhere] text-secondary"
          :data-fact="row.key"
        >
          <template v-for="(part, index) in row.parts" :key="index"
            ><template v-if="index"> · </template><template v-if="typeof part === 'string'">{{ part }}</template
            ><a v-else-if="'href' in part" :href="part.href" target="_blank" rel="noopener noreferrer" :class="LINK">{{
              part.text
            }}</a
            ><button
              v-else
              type="button"
              class="p-0 text-footnote text-secondary underline underline-offset-2 hover:text-ink"
              :data-testid="`fact-${part.action}`"
              @click="emit('action', part.action)"
            >
              {{ part.text }}
            </button></template
          >
        </dd>
      </template>
    </dl>
  </section>
</template>
