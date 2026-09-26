<script setup lang="ts">
/**
 * Equalizer: the preset (applied on change and checked on the player), and
 * for the user presets 1–10 the ten PEQ bands and the master level, edited
 * as a draft and sent with Apply. Stock presets show their bands read-only.
 */
import { computed, ref, watch, type DeepReadonly } from 'vue'
import {
  DEFAULT_BANDS,
  EQ_PRESETS,
  isUserPreset,
  USER_PRESETS,
  validBand,
  type EqState,
  type PeqBand,
} from '../../domain/eq'
import { t } from '../../i18n'
import UiPillButton from '../../ui/UiPillButton.vue'
import UiTextButton from '../../ui/UiTextButton.vue'

const props = defineProps<{ state: DeepReadonly<EqState> | null; locked: boolean }>()
const emit = defineEmits<{ preset: [value: number]; apply: [bands: PeqBand[], master: number] }>()

const bands = ref<PeqBand[]>([])
const master = ref(0)
watch(
  () => props.state,
  (state) => {
    bands.value = state ? state.bands.map((band) => ({ ...band })) : []
    master.value = state?.master ?? 0
  },
  { immediate: true },
)

const editable = computed(() => isUserPreset(props.state?.preset ?? null) && !props.locked)
const known = computed(() => {
  const preset = props.state?.preset
  return preset !== undefined && (EQ_PRESETS.some((item) => item.wire === preset) || isUserPreset(preset))
})
const dirty = computed(() => {
  const state = props.state
  if (!state) return false
  return (
    master.value !== state.master ||
    bands.value.some((band, index) => {
      const before = state.bands[index]
      return !before || before.gain !== band.gain || before.frequency !== band.frequency || before.q !== band.q
    })
  )
})
const valid = computed(() => bands.value.every(validBand) && master.value >= -24 && master.value <= 12)
const label = (frequency: number) => (frequency >= 1000 ? `${String(frequency / 1000)}k` : String(frequency))
const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}`

function flatten(): void {
  bands.value = DEFAULT_BANDS.map((band) => ({ ...band }))
  master.value = 0
}
function choose(event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value)
  if (Number.isInteger(value)) emit('preset', value)
}
</script>

<template>
  <section class="py-16" :aria-label="t('eq_title')">
    <div class="flex flex-wrap items-center justify-between gap-12">
      <div>
        <strong class="block text-13">{{ t('eq_title') }}</strong>
        <small class="text-11 text-muted">{{ t('eq_note') }}</small>
      </div>
      <label class="flex items-center gap-8 text-11 text-muted">
        <span>{{ t('eq_preset') }}</span>
        <select
          :value="state?.preset ?? ''"
          :disabled="locked || !state"
          :aria-label="t('eq_preset')"
          class="rounded-10 border border-line bg-raised px-10 py-9 text-12 text-ink"
          @change="choose"
        >
          <option v-if="state && !known" :value="state.preset" disabled>
            {{ t('eq_unknown', { value: state.preset }) }}
          </option>
          <optgroup :label="t('eq_stock_presets')">
            <option v-for="preset in EQ_PRESETS" :key="preset.wire" :value="preset.wire">{{ t(preset.key) }}</option>
          </optgroup>
          <optgroup :label="t('eq_user_presets')">
            <option v-for="(wire, index) in USER_PRESETS" :key="wire" :value="wire">
              {{ t('eq_user', { n: index + 1 }) }}
            </option>
          </optgroup>
        </select>
      </label>
    </div>

    <template v-if="state">
      <p class="mt-10 mb-0 text-11 text-muted">
        {{ isUserPreset(state.preset) ? t('eq_slot_init') : t('eq_select_user') }}
      </p>
      <div
        class="mt-14 grid grid-cols-10 gap-4 rounded-12 border border-line/70 bg-raised px-8 pt-12 pb-8"
        :class="{ 'opacity-60': !editable }"
      >
        <div v-for="band in bands" :key="band.position" class="flex flex-col items-center gap-6">
          <output class="text-10 text-muted tabular-nums">{{ signed(band.gain) }}</output>
          <input
            v-model.number="band.gain"
            type="range"
            min="-12"
            max="12"
            step="0.5"
            :disabled="!editable"
            :aria-label="t('eq_band_gain', { freq: `${label(band.frequency)} Hz` })"
            class="seek-slider h-110 w-18 [--seek-direction:to_top] [direction:rtl] [writing-mode:vertical-lr]"
            :style="{ '--seek-fill': `${((band.gain + 12) / 24) * 100}%` }"
          />
          <span class="text-10 text-secondary tabular-nums">{{ label(band.frequency) }}</span>
        </div>
      </div>

      <div class="mt-14 flex items-center gap-12">
        <span class="w-120 shrink-0 text-11 text-muted">{{ t('eq_master') }}</span>
        <input
          v-model.number="master"
          type="range"
          min="-24"
          max="12"
          step="0.5"
          :disabled="!editable"
          :aria-label="t('eq_master')"
          class="seek-slider flex-1"
          :style="{ '--seek-fill': `${((master + 24) / 36) * 100}%` }"
        />
        <output class="w-40 text-right text-11 tabular-nums">{{ signed(master) }}</output>
      </div>

      <details class="mt-12 text-11">
        <summary class="cursor-pointer text-secondary">{{ t('eq_fine') }}</summary>
        <div class="mt-10 grid grid-cols-[auto_1fr_1fr] items-center gap-x-12 gap-y-6">
          <template v-for="band in bands" :key="band.position">
            <span class="text-11 text-muted">{{ t('eq_band', { n: band.position + 1 }) }}</span>
            <label class="flex items-center gap-6">
              <span class="sr-only">{{ t('eq_frequency') }}</span>
              <input
                v-model.number="band.frequency"
                type="number"
                min="20"
                max="20000"
                step="1"
                :disabled="!editable"
                :aria-label="`${t('eq_band', { n: band.position + 1 })}: ${t('eq_frequency')}`"
                class="w-full rounded-8 border border-line bg-paper px-8 py-5 text-11 tabular-nums"
              />
            </label>
            <label class="flex items-center gap-6">
              <span class="sr-only">{{ t('eq_q') }}</span>
              <input
                v-model.number="band.q"
                type="number"
                min="0.1"
                max="20"
                step="0.1"
                :disabled="!editable"
                :aria-label="`${t('eq_band', { n: band.position + 1 })}: ${t('eq_q')}`"
                class="w-full rounded-8 border border-line bg-paper px-8 py-5 text-11 tabular-nums"
              />
            </label>
          </template>
        </div>
      </details>

      <div class="mt-14 flex items-center justify-end gap-10">
        <UiTextButton :disabled="!editable" @click="flatten">{{ t('eq_flat') }}</UiTextButton>
        <UiPillButton
          variant="secondary"
          :disabled="!editable || !dirty || !valid"
          @click="
            emit(
              'apply',
              bands.map((band) => ({ ...band })),
              master,
            )
          "
          >{{ t('sound_apply') }}</UiPillButton
        >
      </div>
    </template>
  </section>
</template>
