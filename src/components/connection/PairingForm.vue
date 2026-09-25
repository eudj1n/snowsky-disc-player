<script setup lang="ts">
/** Paste-and-save form for the card token, or the paired state with a forget action. */
import { ref } from 'vue'
import { normalizeToken } from '../../domain/pairing'
import { t } from '../../i18n'
import UiTextButton from '../../ui/UiTextButton.vue'
import UiPillButton from '../../ui/UiPillButton.vue'

defineProps<{ stored: boolean }>()
const emit = defineEmits<{ save: [token: string]; forget: [] }>()

const draft = ref('')
const invalid = ref(false)

function submit(): void {
  const token = normalizeToken(draft.value)
  invalid.value = token === null
  if (token) {
    emit('save', token)
    draft.value = ''
  }
}
</script>

<template>
  <div class="mt-22 border-t border-line pt-22">
    <h3 class="mt-0 mb-8 text-17 font-medium">{{ t('pairing') }}</h3>
    <div v-if="stored" class="flex items-center justify-between gap-14">
      <p class="m-0 text-12 text-secondary" data-testid="paired">{{ t('paired') }}</p>
      <UiTextButton @click="emit('forget')">{{ t('forget_token') }}</UiTextButton>
    </div>
    <form v-else class="flex flex-col gap-12" @submit.prevent="submit">
      <p class="m-0 text-12 leading-[1.7] text-muted">{{ t('pairing_hint') }}</p>
      <label class="flex min-w-0 flex-col gap-7 text-11 text-muted">
        {{ t('pairing_token') }}
        <input
          v-model="draft"
          type="password"
          autocomplete="off"
          spellcheck="false"
          :aria-invalid="invalid"
          class="w-full min-w-0 rounded-10 border border-line bg-raised p-12 text-14 text-ink outline-offset-3 focus:border-secondary aria-invalid:border-accent"
        />
      </label>
      <p v-if="invalid" role="status" class="m-0 text-12 text-accent">{{ t('token_invalid') }}</p>
      <UiPillButton type="submit" variant="secondary" class="self-end">{{ t('pair') }}</UiPillButton>
    </form>
  </div>
</template>
