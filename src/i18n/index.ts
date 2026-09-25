/** Interface strings only: device metadata is never translated. The locale is
 * a browser preference; the player's own language is the first default. */
import { ref } from 'vue'
import { en, type MessageKey } from './en'
import { ru } from './ru'
import { readPreference, writePreference } from '../lib/storage'

export const LOCALES = { en, ru } as const
export type Locale = keyof typeof LOCALES

const STORAGE_KEY = 'disc-player.locale'

function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'ru'
}

const saved = readPreference(STORAGE_KEY)
export const locale = ref<Locale>(isLocale(saved) ? saved : navigator.language.startsWith('ru') ? 'ru' : 'en')
let explicit = isLocale(saved)

/** Adopts the player's language unless the user already chose one. */
export function adoptPlayerLanguage(language: string | null): void {
  if (!explicit && language && isLocale(language)) locale.value = language
}

export function chooseLocale(value: Locale): void {
  explicit = true
  locale.value = value
  writePreference(STORAGE_KEY, value)
}

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const template = LOCALES[locale.value][key]
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}
