/** Shared browser-test helpers: target, token, language and connection steps. */
import { expect, type Page } from '@playwright/test'

export const external = Boolean(process.env.E2E_BASE_URL)
/** The player's serial number (combined-008 pairs by SN only); the mock and the emulator guest use all zeros. */
export const SERIAL = process.env.E2E_SERIAL ?? (external ? undefined : '00000000000000')
export const LANGUAGES = ['zh-Hans', 'zh-Hant', 'en', 'ja', 'ko', 'es', 'it', 'de', 'fr', 'ru']

/** Collects console errors and CSP violations: the gateway CSP is 'self' only. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    // Combined-009: a query of a table stock has dropped (after a scan) answers 409, which the page reads
    // as nothing there; the browser still logs the answer. Other conflicts (a reused request ID) count.
    if (message.text().includes('status of 409') && message.location().url.includes('/api/data/')) return
    errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

/** The Settings page (the top bar's gear, 2026-10-01): theme, text size and the interface language. */
export async function openSettings(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /^(Settings|Настройки)$/ })
    .filter({ visible: true })
    .first()
    .click()
  await expect(page).toHaveURL(/#\/settings/)
  await expect(page.getByTestId('settings-appearance')).toBeVisible()
}

export async function english(page: Page): Promise<void> {
  await page.goto('/')
  await openSettings(page)
  await page.getByTestId('settings-appearance').getByRole('button', { name: 'English', exact: true }).click()
  await page.goto('/')
  // The app has mounted (its shortcuts and views are live) before the test goes on.
  await expect(page.locator('#main')).toBeAttached()
}

/** Runs a command of the search palette (⌘K or Ctrl+K), such as Add music or Sound settings. */
export async function command(page: Page, label: string): Promise<void> {
  await page.keyboard.press('ControlOrMeta+k')
  const palette = page.getByTestId('search-palette')
  await palette.getByRole('combobox').fill(label)
  await palette.getByRole('option', { name: label, exact: true }).click()
}

export async function openConnection(page: Page): Promise<void> {
  // Desktop: the sidebar device card; phones: the top-bar device button.
  await page.getByRole('button', { name: 'DISC connection' }).filter({ visible: true }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

/** The pairing field's label. */
export const PAIRING_FIELD = 'Serial number'

export async function connectAndPair(page: Page): Promise<void> {
  await openConnection(page)
  const dialog = page.getByRole('dialog')
  const field = dialog.getByLabel(PAIRING_FIELD)
  if (SERIAL && (await field.count())) {
    await field.fill(SERIAL)
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

/**
 * The bar's switch between the player and this browser (owner, 2026-09-30); on
 * phones it is in the full-screen player. Waits until the side is the other one.
 */
export async function switchSide(page: Page, to: 'browser' | 'disc'): Promise<void> {
  const flip = page.getByTestId('side-switch').filter({ visible: true })
  if (await flip.count()) await flip.click()
  else {
    await page.getByRole('button', { name: 'Open Now Playing panel' }).first().click()
    await page.getByTestId('side-switch-panel').click()
    await page.keyboard.press('Escape')
  }
  await expect(page.locator('[data-testid=side-switch]')).toHaveAttribute('data-side', to, { timeout: 30_000 })
}
