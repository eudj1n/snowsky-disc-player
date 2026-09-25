<script setup lang="ts">
import PairingForm from '../components/pairing/PairingForm.vue'
import { t } from '../i18n'
import { forgetToken, pairing, saveToken } from '../stores/pairing'
import UiCard from '../ui/UiCard.vue'
</script>

<template>
  <UiCard :title="t('pairing')">
    <PairingForm :stored="pairing.stored" @save="saveToken" @forget="forgetToken" />
  </UiCard>
</template>
