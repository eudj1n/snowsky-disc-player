/**
 * Adding music (reference imports.mjs, import-flow.mjs): validate the whole
 * selection, transfer files one by one (stop at the first that is not
 * confirmed), start one scan, then refresh the collection after the scan's
 * observed end (owner's proposal 4; can be switched off). Each step starts
 * only on the user's action; nothing is resent.
 */
import { computed, reactive, readonly, watch } from 'vue'
import { MAX_IMPORT_FILES, STOCK_UPLOAD_LIMIT, isAudio, validSelection } from '../domain/imports'
import { scanLibrary } from '../gateway/scan'
import { uploadFile } from '../gateway/upload'
import type { MessageKey } from '../i18n'
import { readPreference, writePreference } from '../lib/storage'
import { commandCatalog, connection } from './connection'
import { library, loadCollection } from './library'
import { run } from './operation'
import { pairing, pairingToken } from './pairing'
import { toast } from './ui'

export type ImportPhase = 'waiting' | 'sending' | 'done' | 'exists' | 'not-sent' | 'uncertain'

export interface ImportItem {
  id: number
  file: File
  path: string
  size: number
  phase: ImportPhase
  sent: number
}

export interface PickedFile {
  file: File
  path: string
}

const REFRESH_KEY = 'disc-player.refresh-after-scan'

interface ImportModel {
  items: ImportItem[]
  skipped: number
  transferring: boolean
  scan: { phase: 'idle' | 'scanning' | 'done' | 'not-sent' | 'uncertain'; discovered: number | null }
  collection: 'idle' | 'refreshing' | 'done' | 'failed'
  refreshAfterScan: boolean
}

const state = reactive<ImportModel>({
  items: [],
  skipped: 0,
  transferring: false,
  scan: { phase: 'idle', discovered: null },
  collection: 'idle',
  refreshAfterScan: readPreference(REFRESH_KEY) !== 'off',
})
export const imports = readonly(state)
watch(
  () => state.refreshAfterScan,
  (value) => writePreference(REFRESH_KEY, value ? null : 'off'),
)

let nextId = 0

/** Upload bound: the gateway catalog's upload route, at most stock's 2 GiB − 1. */
export const uploadLimit = computed(() => {
  const route = commandCatalog()?.http?.find((item) => item.name === 'upload_audio')
  return Math.min(STOCK_UPLOAD_LIMIT, route?.max_body_bytes ?? STOCK_UPLOAD_LIMIT)
})

export function setRefreshAfterScan(value: boolean): void {
  state.refreshAfterScan = value
}

/** Adds a selection. Folders skip other file types; individual files must all be audio. */
export function addSelection(picked: readonly PickedFile[], fromFolder: boolean): boolean {
  if (state.transferring || state.scan.phase === 'scanning') return false
  const audio = fromFolder ? picked.filter((item) => isAudio(item.path)) : [...picked]
  const candidates = [
    ...state.items.filter((item) => item.phase === 'waiting'),
    ...audio.map((item) => ({ ...item, size: item.file.size })),
  ]
  if (
    candidates.length > MAX_IMPORT_FILES ||
    !validSelection(
      candidates.map(({ path, size }) => ({ path, size })),
      uploadLimit.value,
    )
  ) {
    toast('import_invalid', true)
    return false
  }
  state.skipped += picked.length - audio.length
  state.items = [
    ...state.items.filter((item) => item.phase === 'waiting'),
    ...audio
      .map((item) => ({
        id: ++nextId,
        file: item.file,
        path: item.path,
        size: item.file.size,
        phase: 'waiting' as const,
        sent: 0,
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  ]
  state.scan = { phase: 'idle', discovered: null }
  state.collection = 'idle'
  return true
}

export function clearSelection(): void {
  if (state.transferring) return
  state.items = []
  state.skipped = 0
}

export async function transferSelection(): Promise<void> {
  const token = pairingToken()
  if (!token || !pairing.paired || state.transferring) return
  state.transferring = true
  try {
    for (const item of state.items) {
      if (item.phase !== 'waiting') continue
      if (connection.connection !== 'connected') break
      item.phase = 'sending'
      const outcome = await run('upload', async (context) => {
        await context.pace()
        context.guard()
        context.attempted()
        return uploadFile({ file: item.file, path: item.path, token, onProgress: (sent) => (item.sent = sent) })
      })
      item.phase =
        outcome === 'confirmed'
          ? 'done'
          : outcome === 'exists'
            ? 'exists'
            : outcome === 'uncertain'
              ? 'uncertain'
              : 'not-sent'
      if (item.phase !== 'done') {
        toast('import_stop_batch', true)
        break
      }
    }
  } finally {
    state.transferring = false
  }
}

export async function startScan(): Promise<void> {
  if (state.scan.phase === 'scanning' || state.transferring) return
  state.scan = { phase: 'scanning', discovered: null }
  const outcome = await run('scan', async (context) => {
    await context.pace()
    return scanLibrary({ ...context, onProgress: (count) => (state.scan.discovered = count) })
  })
  if (outcome === 'busy' || outcome === 'no-session') {
    state.scan = { phase: 'not-sent', discovered: null }
    return
  }
  state.scan = {
    phase: outcome.status === 'confirmed' ? 'done' : outcome.status,
    discovered: outcome.status === 'not-sent' ? null : outcome.discovered,
  }
  if (outcome.status === 'confirmed' && state.refreshAfterScan) await refreshCollection()
}

export async function refreshCollection(): Promise<void> {
  state.collection = 'refreshing'
  await loadCollection(true)
  state.collection = library.status === 'ready' ? 'done' : 'failed'
}

/** The three steps and the guidance line (reference importFlow, adapted). */
export const importFlow = computed<{ step: 0 | 1 | 2 | 3; message: MessageKey }>(() => {
  if (state.scan.phase === 'scanning') return { step: 1, message: 'import_flow_scanning' }
  if (state.transferring) return { step: 0, message: 'import_flow_transferring' }
  if (state.collection === 'refreshing') return { step: 2, message: 'import_flow_refreshing' }
  if (state.scan.phase === 'not-sent') return { step: 1, message: 'import_scan_not_sent' }
  if (state.scan.phase === 'uncertain') return { step: 1, message: 'import_scan_uncertain' }
  if (state.scan.phase === 'done') {
    return state.collection === 'done'
      ? { step: 3, message: 'import_flow_complete' }
      : { step: 2, message: 'import_flow_refresh_ready' }
  }
  if (state.items.some((item) => ['uncertain', 'not-sent', 'exists'].includes(item.phase)))
    return { step: 0, message: 'import_flow_check' }
  if (state.items.some((item) => item.phase === 'waiting')) return { step: 0, message: 'import_flow_selected' }
  if (state.items.some((item) => item.phase === 'done')) return { step: 1, message: 'import_flow_scan_ready' }
  return { step: 0, message: 'import_flow_choose' }
})
