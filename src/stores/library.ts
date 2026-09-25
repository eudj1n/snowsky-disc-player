/** Library facts from the stock databases through the data level; no owner session needed. */
import { reactive, readonly } from 'vue'
import type { LibrarySummary } from '../domain/library'
import { librarySummary } from '../gateway/library'
import { playerLanguage } from '../gateway/settings'
import { adoptPlayerLanguage } from '../i18n'
import { http } from './connection'

const state = reactive<{ summary: LibrarySummary | null }>({ summary: null })
export const library = readonly(state)

export async function loadLibraryFacts(): Promise<void> {
  const [settings, summary] = await Promise.allSettled([http.data('system_settings'), http.data('library_summary')])
  if (settings.status === 'fulfilled') adoptPlayerLanguage(playerLanguage(settings.value))
  if (summary.status === 'fulfilled') state.summary = librarySummary(summary.value)
}
