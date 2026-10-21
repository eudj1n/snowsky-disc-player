<script setup lang="ts">
/**
 * Headphone correction from AutoEq (owner, 2026-10-20): a search over the
 * recommended index as the listener types (the index is read at the first
 * keystroke), the chosen model's ten bands and master level as a preview,
 * and one button that writes them to a user preset of the listener's
 * choice. Off until the owner allows the source in Settings; the credit
 * names the measurement.
 */
import { computed, ref, watch, type DeepReadonly } from 'vue'
import {
  AUTOEQ_RESULTS_DATE,
  AUTOEQ_SITE,
  matchHeadphones,
  type Correction,
  type HeadphoneResult,
} from '../../domain/autoeq'
import { t, type MessageKey } from '../../i18n'
import UiPillButton from '../../ui/UiPillButton.vue'
import UiSelect from '../../ui/UiSelect.vue'
import UiTextButton from '../../ui/UiTextButton.vue'
import UiTextField from '../../ui/UiTextField.vue'

const props = defineProps<{
  /** The source may be asked; `not-admitted` when this release's origins do not reach it; `off` until allowed. */
  access: 'ready' | 'off' | 'not-admitted'
  headphones: readonly DeepReadonly<HeadphoneResult>[]
  index: 'idle' | 'loading' | 'ready' | 'failed'
  chosen: DeepReadonly<HeadphoneResult> | null
  correction: DeepReadonly<Correction> | null
  lookup: 'idle' | 'loading' | 'ready' | 'failed' | 'unfit'
  /** What each user preset 1..10 holds, by number. */
  slots: Readonly<Partial<Record<number, string>>>
  /** The preset the player shows now (wire value), when known. */
  preset: number | null
  locked: boolean
  writing: boolean
}>()
const emit = defineEmits<{
  load: []
  choose: [result: DeepReadonly<HeadphoneResult>]
  clear: []
  write: [slot: number]
}>()

const LIMIT = 8
const query = ref('')
const matches = computed(() => matchHeadphones(props.headphones as HeadphoneResult[], query.value, LIMIT))
// The index is read at the first keystroke; after a failure the next keystroke asks again.
watch(query, (value) => {
  if (value.trim() !== '' && (props.index === 'idle' || props.index === 'failed')) emit('load')
})

const SLOTS = Array.from({ length: 10 }, (_, index) => index + 1)
const slot = ref(1)
/** The preset shown when it is a user one, else the first without headphones, else the first. */
function defaultSlot(): number {
  const shown = props.preset
  if (shown !== null && shown >= 160 && shown <= 169) return shown - 159
  return SLOTS.find((number) => !props.slots[number]) ?? 1
}
watch(
  () => props.chosen,
  (chosen) => {
    if (chosen) slot.value = defaultSlot()
  },
)

const FORM_TEXT: Record<HeadphoneResult['form'], MessageKey> = {
  'over-ear': 'autoeq_form_over_ear',
  'in-ear': 'autoeq_form_in_ear',
  earbud: 'autoeq_form_earbud',
}
const measured = (result: DeepReadonly<HeadphoneResult>) =>
  result.rig
    ? t('autoeq_measured_rig', { source: result.source, rig: result.rig })
    : t('autoeq_measured', { source: result.source })
const label = (frequency: number) => (frequency >= 1000 ? `${String(frequency / 1000)}k` : String(frequency))
const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}`
/** A band's bar: from the middle up for a boost, down for a cut, 12 dB filling half the height. */
const bar = (gain: number) => ({
  height: `${String(Math.min(Math.abs(gain), 12) / 0.24)}%`,
  ...(gain >= 0 ? { bottom: '50%' } : { top: '50%' }),
})
const slotLabel = (number: number) =>
  props.slots[number] ? t('eq_user_named', { n: number, name: props.slots[number] }) : t('eq_user', { n: number })
const lookupText = computed<MessageKey | null>(() =>
  props.lookup === 'loading'
    ? 'autoeq_reading'
    : props.lookup === 'failed'
      ? 'autoeq_unreachable'
      : props.lookup === 'unfit'
        ? 'autoeq_unfit'
        : null,
)
</script>

<template>
  <section class="py-16" :aria-label="t('autoeq_title')" data-testid="autoeq">
    <div class="flex flex-wrap items-baseline justify-between gap-x-12 gap-y-4">
      <strong class="block text-body">{{ t('autoeq_title') }}</strong>
      <a
        :href="AUTOEQ_SITE"
        target="_blank"
        rel="noopener noreferrer"
        class="text-footnote text-muted underline-offset-2 hover:text-ink hover:underline"
        >AutoEq</a
      >
    </div>
    <p class="mt-2 mb-0 text-footnote leading-[1.5] text-muted">{{ t('autoeq_note') }}</p>

    <p v-if="access === 'not-admitted'" class="mt-10 mb-0 text-footnote text-secondary" data-testid="autoeq-off">
      {{ t('source_not_admitted') }}
    </p>
    <p v-else-if="access === 'off'" class="mt-10 mb-0 text-footnote text-secondary" data-testid="autoeq-off">
      {{ t('autoeq_off') }}
      <RouterLink
        :to="{ path: '/settings', query: { part: 'sources' } }"
        class="text-ink underline decoration-line underline-offset-2 hover:decoration-ink"
        >{{ t('external_sources') }}</RouterLink
      >
    </p>

    <template v-else>
      <div class="mt-12 max-w-320">
        <UiTextField v-model="query" variant="search" :label="t('autoeq_search')" data-testid="autoeq-search" />
      </div>
      <p v-if="index === 'loading'" role="status" class="mt-8 mb-0 text-footnote text-muted">
        {{ t('autoeq_loading') }}
      </p>
      <p v-else-if="index === 'failed'" role="status" class="mt-8 mb-0 text-footnote text-secondary">
        {{ t('autoeq_unreachable') }}
      </p>
      <template v-else-if="index === 'ready' && query.trim() !== ''">
        <ul v-if="matches.results.length" class="m-0 mt-8 grid list-none gap-4 p-0" data-testid="autoeq-results">
          <li v-for="result in matches.results" :key="result.path">
            <button
              type="button"
              class="flex w-full flex-wrap items-baseline gap-x-8 rounded-10 px-10 py-7 text-left hover:bg-hover"
              :class="{ 'bg-soft': chosen?.path === result.path }"
              :aria-pressed="chosen?.path === result.path"
              @click="emit('choose', result)"
            >
              <span class="text-footnote text-ink">{{ result.name }}</span>
              <span class="text-caption text-muted"
                >{{ result.source }}<template v-if="result.rig"> · {{ result.rig }}</template> ·
                {{ t(FORM_TEXT[result.form]) }}</span
              >
            </button>
          </li>
        </ul>
        <p v-else class="mt-8 mb-0 text-footnote text-muted" data-testid="autoeq-none">{{ t('autoeq_none') }}</p>
        <p v-if="matches.total > matches.results.length" class="mt-4 mb-0 text-caption text-muted">
          {{ t('autoeq_more', { shown: matches.results.length, total: matches.total }) }}
        </p>
      </template>

      <div
        v-if="chosen"
        class="mt-14 rounded-12 border border-line/70 bg-raised px-14 py-12"
        data-testid="autoeq-chosen"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-x-12 gap-y-4">
          <div>
            <strong class="block text-callout font-semibold">{{ chosen.name }}</strong>
            <span class="text-caption text-muted">{{ measured(chosen) }} · {{ t(FORM_TEXT[chosen.form]) }}</span>
          </div>
          <UiTextButton @click="emit('clear')">{{ t('autoeq_clear') }}</UiTextButton>
        </div>
        <p v-if="lookupText" role="status" class="mt-8 mb-0 text-footnote text-muted">{{ t(lookupText) }}</p>
        <template v-if="correction && lookup === 'ready'">
          <div class="mt-12 grid grid-cols-10 gap-4" data-testid="autoeq-preview">
            <div v-for="band in correction.bands" :key="band.position" class="flex flex-col items-center gap-4">
              <output class="text-caption2 text-muted tabular-nums">{{ signed(band.gain) }}</output>
              <div class="relative h-56 w-10 rounded-full bg-soft" :aria-hidden="true">
                <span class="absolute inset-x-0 top-1/2 h-px bg-line"></span>
                <span class="absolute inset-x-0 rounded-full bg-progress-fill" :style="bar(band.gain)"></span>
              </div>
              <span class="text-caption text-secondary tabular-nums">{{ label(band.frequency) }}</span>
            </div>
          </div>
          <p class="mt-8 mb-0 text-footnote text-secondary tabular-nums">
            {{ t('eq_master') }}: {{ signed(correction.preamp) }} dB
          </p>
          <div class="mt-12 flex flex-wrap items-center justify-end gap-10">
            <label class="flex items-center gap-8 text-footnote text-muted">
              <span>{{ t('autoeq_slot') }}</span>
              <UiSelect>
                <select
                  v-model.number="slot"
                  :disabled="locked || writing"
                  :aria-label="t('autoeq_slot')"
                  class="rounded-10 border border-line bg-raised py-9 pl-12 text-body text-ink"
                  data-testid="autoeq-slot"
                >
                  <option v-for="number in SLOTS" :key="number" :value="number">{{ slotLabel(number) }}</option>
                </select>
              </UiSelect>
            </label>
            <UiPillButton :disabled="locked || writing" data-testid="autoeq-write" @click="emit('write', slot)">{{
              t('autoeq_write')
            }}</UiPillButton>
          </div>
        </template>
      </div>
      <p class="mt-10 mb-0 text-caption leading-[1.5] text-muted">
        {{ t('autoeq_credit', { date: AUTOEQ_RESULTS_DATE }) }}
      </p>
    </template>
  </section>
</template>
