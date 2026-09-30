<script setup lang="ts">
/**
 * The hosted page's player (2026-09-30): where the page looks for DISC on the
 * local network (stock's ingenic.local unless the user gives an address) and,
 * when it gets no answer, the likely reason from the local network permission.
 */
import { computed, ref, useId } from 'vue'
import { DEFAULT_GATEWAY, gatewayBase, setGatewayBase } from '../gateway/address'
import { t } from '../i18n'
import { localAccess } from '../stores/localAccess'
import UiPillButton from '../ui/UiPillButton.vue'

withDefaults(defineProps<{ explain?: boolean }>(), { explain: false })
const plain = (url: string) => url.replace(/^http:\/\//, '')
const address = ref(plain(gatewayBase()))
/** The empty collection and the connection dialog may both show it. */
const field = useId()
const invalid = ref(false)
const reason = computed(() =>
  localAccess.access === 'unsupported'
    ? 'hosted_unsupported'
    : localAccess.access === 'denied'
      ? 'hosted_denied'
      : 'hosted_not_found',
)
/** A new address takes effect with a fresh start of the page. */
function save(): void {
  if (!setGatewayBase(address.value)) {
    invalid.value = true
    return
  }
  location.reload()
}
</script>

<template>
  <div class="text-left" data-testid="hosted-player">
    <p v-if="explain" class="mt-0 mb-16 text-footnote leading-[1.55] text-secondary" data-testid="hosted-reason">
      {{ t(reason, { address: plain(gatewayBase()) }) }}
    </p>
    <form class="flex flex-wrap items-end gap-10" @submit.prevent="save">
      <label class="grid min-w-0 flex-1 gap-6 text-footnote text-muted" :for="field">
        {{ t('hosted_address') }}
        <input
          :id="field"
          v-model="address"
          data-testid="hosted-address"
          type="text"
          inputmode="url"
          autocomplete="off"
          spellcheck="false"
          :aria-invalid="invalid"
          class="min-w-0 rounded-10 border border-line bg-soft px-12 py-9 text-body text-ink outline-none focus:border-accent aria-invalid:border-notice"
          @input="invalid = false"
        />
      </label>
      <UiPillButton type="submit" variant="secondary">{{ t('hosted_address_save') }}</UiPillButton>
    </form>
    <p v-if="invalid" class="mt-6 mb-0 text-footnote text-notice" role="alert">{{ t('hosted_address_invalid') }}</p>
    <p class="mt-10 mb-0 text-caption text-muted">
      {{ t('hosted_address_hint', { default: plain(DEFAULT_GATEWAY) }) }}
    </p>
  </div>
</template>
