/** Stock system settings from the data level (query system_settings). */
import { rowsOf, type DataResult } from './http'

/** LANGUAGE index in stock menu order (mq_ui), confirmed on a V2.57 player for index 2. */
export const STOCK_LANGUAGES = ['zh-Hans', 'zh-Hant', 'en', 'ja', 'ko', 'es', 'it', 'de', 'fr', 'ru'] as const
export type StockLanguage = (typeof STOCK_LANGUAGES)[number]

export function playerLanguage(result: DataResult): StockLanguage | null {
  const index = rowsOf(result)[0]?.LANGUAGE
  return typeof index === 'number' ? (STOCK_LANGUAGES[index] ?? null) : null
}

/** The online cover and lyrics options (ONLINE_COVER, ONLINE_LRC: 1 on, 0 off; stock default off). */
export function onlineOptions(result: DataResult): { covers: boolean; lyrics: boolean } | null {
  const row = rowsOf(result)[0]
  if (!row) return null
  return { covers: row.ONLINE_COVER === 1, lyrics: row.ONLINE_LRC === 1 }
}

/** Firmware main OS number from the 0501 settings reply (a501). */
export function socVersion(payload: string): number | null {
  const value: unknown = JSON.parse(payload)
  if (!value || typeof value !== 'object') return null
  const soc = (value as Record<string, unknown>).soc_version
  return typeof soc === 'number' && Number.isInteger(soc) ? soc : null
}

/** currentVolume from the 0501 settings reply (0..120), as the reference Controller validates it. */
export function currentVolume(payload: string): number | null {
  const value: unknown = JSON.parse(payload)
  if (!value || typeof value !== 'object') return null
  const volume = (value as Record<string, unknown>).currentVolume
  return typeof volume === 'number' && Number.isInteger(volume) && volume >= 0 && volume <= 120 ? volume : null
}
