<script setup lang="ts">
/**
 * Sound settings (reference #sound-dialog). Opening reads the four values.
 * Gain and DRE apply on press and are checked on the player (owner's
 * proposal 5); balance and filter keep an explicit Apply, where a slip is
 * easy. Controls lock while a change runs or before values were read.
 */
import { computed, ref, watch } from 'vue'
import { balanceLabel, FILTER_LABELS, type SoundName } from '../gateway/sound'
import { t } from '../i18n'
import { connection } from '../stores/connection'
import { operation } from '../stores/operation'
import { applySound, markSoundDraft, readSoundSettings, sound } from '../stores/sound'
import { applyBands, applyPreset, eq, readEqSettings } from '../stores/eq'
import EqualizerPanel from '../components/sound/EqualizerPanel.vue'
import { closeDialog, ui } from '../stores/ui'
import UiChips from '../ui/UiChips.vue'
import UiDialog from '../ui/UiDialog.vue'
import UiPillButton from '../ui/UiPillButton.vue'

const open = computed(() => ui.dialog === 'sound')
const ready = computed(() => connection.connection === 'connected' && connection.identity?.compatible === true)
const locked = computed(() => !ready.value || operation.busy || sound.pending !== null || !sound.values)
const balance = ref(0)
const filter = ref(0)
const gain = computed({
  get: () => String(sound.values?.gain ?? 0),
  set: (value: string) => void applySound('gain', Number(value)),
})
const dre = computed({
  get: () => String(sound.values?.dre ?? 0),
  set: (value: string) => void applySound('dre', Number(value)),
})

watch(
  () => sound.values,
  (values) => {
    if (values) {
      balance.value = values.balance
      filter.value = values.filter
    }
  },
)
watch(open, async (value) => {
  if (!value || !ready.value) return
  await readSoundSettings()
  await readEqSettings()
})
const eqLocked = computed(() => !ready.value || operation.busy || eq.pending)

const notice = computed(() => (!ready.value ? t('sound_connect') : sound.feedback ? t(sound.feedback) : ''))
const applyDisabled = (name: SoundName, draft: number) => locked.value || sound.values?.[name] === draft
</script>

<template>
  <UiDialog :open="open" :eyebrow="t('sound_eyebrow')" :close-label="t('close')" size="lg" @close="closeDialog">
    <h2 class="mt-18 mb-8 text-30 font-bold tracking-[-1px]">{{ t('sound_title') }}</h2>
    <p class="m-0 text-12 leading-[1.7] text-muted">{{ t('sound_description') }}</p>
    <div class="my-18 flex flex-wrap items-center justify-between gap-12">
      <p role="status" class="m-0 text-12 text-secondary" data-testid="sound-feedback">{{ notice }}</p>
      <UiPillButton variant="secondary" :disabled="!ready || operation.busy" @click="readSoundSettings">{{
        t('sound_refresh')
      }}</UiPillButton>
    </div>
    <div v-if="sound.values" class="divide-y divide-line/70 border-y border-line/70">
      <div class="flex flex-wrap items-center justify-between gap-12 py-16">
        <div>
          <strong class="block text-13">{{ t('sound_gain') }}</strong>
          <small class="text-11 text-muted">{{ t('sound_gain_note') }}</small>
        </div>
        <UiChips
          v-model="gain"
          :label="t('sound_gain')"
          :options="[
            { value: '0', text: t('sound_low') },
            { value: '1', text: t('sound_high') },
          ]"
          :class="{ 'pointer-events-none opacity-45': locked }"
        />
      </div>
      <div class="py-16">
        <div class="flex flex-wrap items-center justify-between gap-12">
          <div>
            <strong class="block text-13">{{ t('sound_balance') }}</strong>
            <small class="text-11 text-muted">{{ t('sound_balance_note') }}</small>
          </div>
          <UiPillButton
            variant="secondary"
            :disabled="applyDisabled('balance', balance)"
            @click="applySound('balance', balance)"
            >{{ t('sound_apply') }}</UiPillButton
          >
        </div>
        <div class="mt-12 flex items-center gap-12">
          <input
            v-model.number="balance"
            type="range"
            min="-20"
            max="20"
            step="1"
            :disabled="locked"
            :aria-label="t('sound_balance')"
            :aria-valuetext="balanceLabel(balance)"
            class="flex-1 accent-progress-fill"
            @input="markSoundDraft"
          />
          <output class="w-32 text-right text-12 tabular-nums">{{ balanceLabel(balance) }}</output>
        </div>
        <div class="mt-4 flex justify-between pr-44 text-9 text-muted">
          <span>L20</span><span>0</span><span>R20</span>
        </div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-12 py-16">
        <div>
          <strong class="block text-13">{{ t('sound_filter') }}</strong>
          <small class="text-11 text-muted">{{ t('sound_filter_note') }}</small>
        </div>
        <div class="flex items-center gap-10">
          <select
            v-model.number="filter"
            :disabled="locked"
            :aria-label="t('sound_filter')"
            class="rounded-10 border border-line bg-raised px-10 py-9 text-12 text-ink"
            @change="markSoundDraft"
          >
            <option v-for="(label, index) in FILTER_LABELS" :key="label" :value="index">
              {{ index + 1 }} · {{ label }}
            </option>
          </select>
          <UiPillButton
            variant="secondary"
            :disabled="applyDisabled('filter', filter)"
            @click="applySound('filter', filter)"
            >{{ t('sound_apply') }}</UiPillButton
          >
        </div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-12 py-16">
        <div>
          <strong class="block text-13">DRE</strong>
          <small class="text-11 text-muted">{{ t('sound_dre_note') }}</small>
        </div>
        <UiChips
          v-model="dre"
          label="DRE"
          :options="[
            { value: '0', text: t('sound_off') },
            { value: '1', text: t('sound_on') },
          ]"
          :class="{ 'pointer-events-none opacity-45': locked }"
        />
      </div>
      <EqualizerPanel
        :state="eq.current"
        :locked="eqLocked"
        @preset="applyPreset"
        @apply="(bands, master) => applyBands(bands, master)"
      />
      <p v-if="eq.feedback" role="status" class="m-0 pb-12 text-11 text-secondary" data-testid="eq-feedback">
        {{ t(eq.feedback) }}
      </p>
    </div>
  </UiDialog>
</template>
