<script setup lang="ts">
/**
 * One dialog for every playlist change (reference playlist editor): create,
 * rename, delete, add tracks, remove a track. The change runs through the
 * guarded playlist store; the dialog closes when the player confirms it and
 * otherwise keeps the reason in view. Nothing is retried.
 */
import { computed, nextTick, ref, watch, type DeepReadonly } from 'vue'
import { useRouter } from 'vue-router'
import { t } from '../i18n'
import { library } from '../stores/library'
import {
  addToPlaylist,
  createPlaylistNamed,
  deletePlaylistNamed,
  playlistMessage,
  removeFromFavorites,
  removeFromPlaylist,
  renamePlaylistTo,
  type PlaylistResult,
} from '../stores/playlistEdits'
import { operation } from '../stores/operation'
import { closePlaylistDialog, openPlaylistDialog, ui, type PlaylistDialog } from '../stores/ui'
import UiDialog from '../ui/UiDialog.vue'
import UiPillButton from '../ui/UiPillButton.vue'
import UiTextButton from '../ui/UiTextButton.vue'
import { ensureControl } from '../views/ensureControl'

const router = useRouter()
const dialog = computed(() => ui.playlistDialog)
const name = ref('')
const choice = ref('')
const feedback = ref<string | null>(null)
const running = ref(false)
const field = ref<HTMLInputElement | null>(null)

const TITLES = {
  create: 'new_playlist',
  rename: 'rename',
  delete: 'delete_playlist',
  add: 'add_to_playlist',
  remove: 'remove_from_playlist',
  unfavorite: 'remove_from_favorites',
} as const
const SUBMITS = {
  create: 'create',
  rename: 'save',
  delete: 'delete',
  add: 'add_to_playlist',
  remove: 'remove',
  unfavorite: 'remove',
} as const

const names = computed(() => library.playlists.map((playlist) => playlist.name))
const needsName = computed(() => dialog.value?.mode === 'create' || dialog.value?.mode === 'rename')
const ready = computed(() => {
  const current = dialog.value
  if (!current || running.value || operation.busy) return false
  if (needsName.value) return name.value.trim() !== ''
  if (current.mode === 'add') return choice.value !== ''
  return true
})

watch(dialog, async (current) => {
  feedback.value = null
  running.value = false
  name.value = current?.mode === 'rename' ? current.playlist : ''
  choice.value = current?.mode === 'add' ? (names.value[0] ?? '') : ''
  if (needsName.value) {
    await nextTick()
    field.value?.focus()
  }
})

function perform(current: DeepReadonly<PlaylistDialog>): Promise<PlaylistResult> {
  const next = name.value.trim()
  switch (current.mode) {
    case 'create':
      return createPlaylistNamed(next)
    case 'rename':
      return renamePlaylistTo(current.playlist, next)
    case 'delete':
      return deletePlaylistNamed(current.playlist)
    case 'add':
      return addToPlaylist(choice.value, current.tracks)
    case 'remove':
      return removeFromPlaylist(current.playlist, current.track)
    case 'unfavorite':
      return removeFromFavorites(current.track)
  }
}

async function submit(): Promise<void> {
  const current = dialog.value
  if (!current || !ready.value) return
  running.value = true
  feedback.value = null
  try {
    if (!(await ensureControl())) return
    const result = await perform(current)
    if (result === 'confirmed' || result === 'already') {
      closePlaylistDialog()
      if (current.mode === 'delete') await router.push('/playlists')
      return
    }
    feedback.value = t(playlistMessage(result)[0])
  } finally {
    running.value = false
  }
}
</script>

<template>
  <UiDialog
    :open="dialog !== null"
    :eyebrow="dialog?.mode === 'unfavorite' ? t('favorites') : t('playlists')"
    :close-label="t('close')"
    wide
    @close="closePlaylistDialog"
  >
    <form v-if="dialog" class="mt-14" @submit.prevent="submit">
      <h2 class="mt-0 mb-8 text-24 font-bold tracking-[-0.6px]">{{ t(TITLES[dialog.mode]) }}</h2>
      <p v-if="dialog.mode === 'add'" class="mt-0 mb-16 truncate text-12 text-muted">
        {{ t('playlist_adding', { title: dialog.title }) }}
      </p>
      <p v-else-if="dialog.mode === 'delete'" class="mt-0 mb-16 text-12 leading-[1.6] text-secondary">
        {{ t('playlist_delete_confirm', { name: dialog.playlist }) }}
      </p>
      <p v-else-if="dialog.mode === 'unfavorite'" class="mt-0 mb-16 text-12 leading-[1.6] text-secondary">
        {{ t('favorite_remove_confirm', { track: dialog.track.title }) }}
      </p>
      <p v-else-if="dialog.mode === 'remove'" class="mt-0 mb-16 text-12 leading-[1.6] text-secondary">
        {{ t('playlist_remove_confirm', { track: dialog.track.title, name: dialog.playlist }) }}
      </p>

      <label v-if="needsName" class="mb-16 block">
        <span class="mb-6 block text-11 text-muted">{{ t('playlist_name') }}</span>
        <input
          ref="field"
          v-model="name"
          type="text"
          maxlength="100"
          required
          autocomplete="off"
          class="w-full rounded-10 border border-line bg-paper px-14 py-11 text-13 text-ink focus-visible:border-secondary"
        />
      </label>

      <template v-if="dialog.mode === 'add'">
        <label v-if="names.length" class="mb-16 block">
          <span class="mb-6 block text-11 text-muted">{{ t('playlist_choose') }}</span>
          <select
            v-model="choice"
            class="w-full rounded-10 border border-line bg-paper px-12 py-10 text-13 text-ink focus-visible:border-secondary"
          >
            <option v-for="option in names" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
        <p v-else class="mb-16 flex items-center gap-10 text-12 text-muted">
          {{ t('playlist_empty') }}
          <UiTextButton icon="arrow" @click="openPlaylistDialog({ mode: 'create' })">{{
            t('new_playlist')
          }}</UiTextButton>
        </p>
      </template>

      <p v-if="dialog.mode !== 'unfavorite'" class="mt-0 mb-18 text-11 leading-[1.6] text-muted">
        {{ t('playlist_no_files') }}
      </p>
      <p v-if="feedback" role="status" class="mt-0 mb-14 text-11 text-accent" data-testid="playlist-feedback">
        {{ feedback }}
      </p>
      <div class="flex items-center justify-end gap-10">
        <UiTextButton @click="closePlaylistDialog">{{ t('cancel') }}</UiTextButton>
        <UiPillButton type="submit" :disabled="!ready">{{ t(SUBMITS[dialog.mode]) }}</UiPillButton>
      </div>
    </form>
  </UiDialog>
</template>
