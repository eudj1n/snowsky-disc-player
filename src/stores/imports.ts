/**
 * Adding music (reference imports.mjs, import-flow.mjs): validate the whole
 * selection, transfer files one by one (skip names already on the card, stop
 * at the first other file that is not confirmed), start one scan, then refresh the collection after the scan's
 * observed end (owner's proposal 4; can be switched off). Each step starts
 * only on the user's action; nothing is resent.
 */
import { computed, reactive, readonly, watch } from 'vue'
import { MAX_IMPORT_FILES, STOCK_UPLOAD_LIMIT, importable, validSelection } from '../domain/imports'
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
  /** The card folder new files go into ('' is the card root; the file manager sets it). */
  destination: string
}

const state = reactive<ImportModel>({
  items: [],
  skipped: 0,
  transferring: false,
  scan: { phase: 'idle', discovered: null },
  collection: 'idle',
  refreshAfterScan: readPreference(REFRESH_KEY) !== 'off',
  destination: '',
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

/**
 * Where the next selection goes. It changes only while nothing waits or
 * travels, so files already chosen keep the folder they were chosen for.
 */
export function setImportDestination(folder: string): boolean {
  if (state.transferring || state.items.some((item) => item.phase === 'waiting')) return state.destination === folder
  state.destination = folder
  return true
}

export function setRefreshAfterScan(value: boolean): void {
  state.refreshAfterScan = value
}

/** Adds a selection. Folders skip other file types; individual files must all be music, lyrics or covers. */
export function addSelection(picked: readonly PickedFile[], fromFolder: boolean): boolean {
  if (state.transferring || state.scan.phase === 'scanning') return false
  const into = (path: string) => (state.destination ? `${state.destination}/${path}` : path)
  const audio = (fromFolder ? picked.filter((item) => importable(item.path, item.file.size)) : [...picked]).map(
    (item) => ({ ...item, path: into(item.path) }),
  )
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

/** Drops a file that has not arrived from the list; confirmed files stay as the batch record. */
export function removeItem(id: number): void {
  if (state.transferring) return
  state.items = state.items.filter((item) => item.id !== id || item.phase === 'done')
}

/**
 * Sends a file again at the listener's request. Safe: the gateway creates the
 * file exclusively and never overwrites, so a file that did arrive answers
 * "already on the card".
 */
export function retryItem(id: number): void {
  if (state.transferring) return
  const item = state.items.find((entry) => entry.id === id)
  if (item && (item.phase === 'not-sent' || item.phase === 'uncertain')) {
    item.phase = 'waiting'
    item.sent = 0
  }
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
      // A name already on the card is skipped (nothing is overwritten), so the
      // same album folder can be dropped again: only new files travel.
      if (item.phase === 'exists') continue
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
  if (state.items.some((item) => ['uncertain', 'not-sent'].includes(item.phase)))
    return { step: 0, message: 'import_flow_check' }
  if (state.items.some((item) => item.phase === 'waiting')) return { step: 0, message: 'import_flow_selected' }
  if (state.items.some((item) => item.phase === 'done')) return { step: 1, message: 'import_flow_scan_ready' }
  if (state.items.some((item) => item.phase === 'exists')) return { step: 1, message: 'import_flow_all_present' }
  return { step: 0, message: 'import_flow_choose' }
})
