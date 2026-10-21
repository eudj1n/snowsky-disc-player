<script setup lang="ts">
/**
 * A section's label in the Add music dialog, carrying the step's state
 * (owner, 2026-10-21): a small circle with the number, a check once the
 * step is done, the accent on the current step. The three sections are the
 * progress; nothing above them repeats it.
 */
import { t } from '../i18n'
import UiIcon from '../ui/UiIcon.vue'

defineProps<{ index: number; label: string; state: 'done' | 'current' | 'ahead' }>()
</script>

<template>
  <p
    class="m-0 flex items-center gap-8 text-caption2 font-semibold tracking-caps"
    :class="state === 'current' ? 'text-ink' : state === 'done' ? 'text-secondary' : 'text-muted'"
    :aria-current="state === 'current' ? 'step' : undefined"
    :data-step-state="state"
  >
    <span
      class="grid size-18 shrink-0 place-items-center rounded-full text-[10px] tabular-nums"
      :class="
        state === 'done'
          ? 'bg-accent text-white'
          : state === 'current'
            ? 'border-[1.5px] border-accent text-accent'
            : 'border border-line text-muted'
      "
      aria-hidden="true"
    >
      <UiIcon v-if="state === 'done'" name="check" class="size-11 stroke-[2.4]" />
      <template v-else>{{ index + 1 }}</template>
    </span>
    <span>{{ label }}</span>
    <span v-if="state === 'done'" class="sr-only">, {{ t('import_step_done') }}</span>
  </p>
</template>
