<script setup lang="ts">
/** Paste-and-save form for the card token, or the paired state with a forget action. */
import { ref } from 'vue'
import { normalizeToken } from '../../domain/pairing'
import { t } from '../../i18n'
import UiButton from '../../ui/UiButton.vue'
import UiNotice from '../../ui/UiNotice.vue'
import UiTextField from '../../ui/UiTextField.vue'

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
  <div v-if="stored" class="flex items-center gap-3">
    <p class="text-sm text-muted" data-testid="paired">{{ t('paired') }}</p>
    <UiButton class="ml-auto" @click="emit('forget')">{{ t('forget_token') }}</UiButton>
  </div>
  <form v-else class="space-y-3" @submit.prevent="submit">
    <p class="text-sm text-muted">{{ t('pairing_hint') }}</p>
    <UiTextField v-model="draft" type="password" :label="t('pairing_token')" :invalid="invalid" />
    <UiNotice v-if="invalid">{{ t('token_invalid') }}</UiNotice>
    <UiButton type="submit" variant="primary">{{ t('pair') }}</UiButton>
  </form>
</template>
