/** Shared browser-test helpers: target, token, language and connection steps. */
import { expect, type Page } from '@playwright/test'

export const external = Boolean(process.env.E2E_BASE_URL)
export const TOKEN = process.env.E2E_TOKEN ?? (external ? undefined : 'mock-token-0123456789-abcdefghijklmnop')
export const LANGUAGES = ['zh-Hans', 'zh-Hant', 'en', 'ja', 'ko', 'es', 'it', 'de', 'fr', 'ru']

/** Collects console errors and CSP violations: the gateway CSP is 'self' only. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

export async function english(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('combobox', { name: /Interface language|Язык интерфейса/ }).selectOption('en')
}

export async function openConnection(page: Page): Promise<void> {
  // Desktop: the sidebar device card; phones: the top-bar device button.
  await page.getByRole('button', { name: 'DISC connection' }).filter({ visible: true }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

export async function connectAndPair(page: Page): Promise<void> {
  await openConnection(page)
  const dialog = page.getByRole('dialog')
  if (TOKEN && (await dialog.getByLabel('Pairing token').count())) {
    await dialog.getByLabel('Pairing token').fill(TOKEN)
    await dialog.getByRole('button', { name: 'Pair' }).click()
  }
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(dialog.getByTestId('connection-state')).toContainText('Connected')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
}

export async function disconnect(page: Page): Promise<void> {
  // On phones the listening panel covers the top bar; minimize it first.
  if (await page.getByRole('complementary', { name: 'Player view' }).isVisible()) await page.keyboard.press('Escape')
  await openConnection(page)
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click()
  await expect(page.getByRole('dialog').getByTestId('connection-state')).toContainText('Disconnected')
  await page.keyboard.press('Escape')
}
