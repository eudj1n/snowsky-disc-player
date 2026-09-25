import { expect, test, type Page } from '@playwright/test'

const external = Boolean(process.env.E2E_BASE_URL)
const TOKEN = process.env.E2E_TOKEN ?? (external ? undefined : 'mock-token-0123456789-abcdefghijklmnop')
const LANGUAGES = ['zh-Hans', 'zh-Hant', 'en', 'ja', 'ko', 'es', 'it', 'de', 'fr', 'ru']

/** Collects console errors and CSP violations: the gateway CSP is 'self' only. */
function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

test.describe.configure({ mode: 'serial' })

test('loads from / under the gateway CSP and adopts the player language', async ({ page, request }) => {
  const errors = watchErrors(page)
  const settings = (await (await request.get('/api/data/system_settings')).json()) as { rows: number[][] }
  const index = settings.rows[0]?.[0] ?? -1
  const expected = LANGUAGES[index] === 'ru' ? 'ru' : 'en'
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', expected)
  await expect(page.getByTestId('library')).toBeVisible()
  expect(errors).toEqual([])
})

test('connects as the single owner, reads identity and state, then disconnects', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/')
  await page.getByRole('combobox', { name: /Language|Язык/ }).selectOption('en')
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(page.getByTestId('connection-state')).toHaveText('Connected')
  await expect(page.getByTestId('identity')).toHaveText('0306')
  await expect(page.getByTestId('firmware')).toHaveText('257')
  await expect(page.getByTestId('toggle')).toBeDisabled()
  await page.getByRole('button', { name: 'Disconnect' }).click()
  await expect(page.getByTestId('connection-state')).toHaveText('Disconnected')
  expect(errors).toEqual([])
})

test('pairs with the card token and toggles playback with a fresh read', async ({ page }) => {
  test.skip(!TOKEN, 'E2E_TOKEN is required against a real gateway')
  const errors = watchErrors(page)
  await page.goto('/')
  await page.getByRole('combobox', { name: /Language|Язык/ }).selectOption('en')
  await page.getByPlaceholder('Pairing token').fill(TOKEN ?? '')
  await page.getByRole('button', { name: 'Pair' }).click()
  await expect(page.getByTestId('paired')).toBeVisible()
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(page.getByTestId('connection-state')).toHaveText('Connected')
  const state = page.getByTestId('playback-state')
  await expect(state).toHaveText(/Playing|Paused/)
  const before = await state.textContent()
  await page.getByTestId('toggle').click()
  await expect(state).not.toHaveText(before ?? '')
  await page.getByTestId('toggle').click()
  await expect(state).toHaveText(before ?? '')
  await page.getByRole('button', { name: 'Disconnect' }).click()
  expect(errors).toEqual([])
})

test('fits a narrow viewport without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})
