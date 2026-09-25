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

async function english(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('combobox', { name: /Interface language|Язык интерфейса/ }).selectOption('en')
}

async function openConnection(page: Page): Promise<void> {
  // Desktop: the sidebar device card; phones: the top-bar device button.
  await page.getByRole('button', { name: 'DISC connection' }).filter({ visible: true }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

async function connectAndPair(page: Page): Promise<void> {
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

async function disconnect(page: Page): Promise<void> {
  await openConnection(page)
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click()
  await expect(page.getByRole('dialog').getByTestId('connection-state')).toContainText('Disconnected')
  await page.keyboard.press('Escape')
}

test.describe.configure({ mode: 'serial' })

test('loads from / under the gateway CSP, adopts the player language and shows the collection', async ({
  page,
  request,
}) => {
  const errors = watchErrors(page)
  const settings = (await (await request.get('/api/data/system_settings')).json()) as { rows: number[][] }
  const expected = LANGUAGES[settings.rows[0]?.[0] ?? -1] === 'ru' ? 'ru' : 'en'
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', expected)
  await page.goto('/#/tracks')
  await expect(page.getByRole('table').getByRole('row').nth(1)).toBeVisible()
  expect(errors).toEqual([])
})

test('connects as the single owner and reads identity, then disconnects', async ({ page }) => {
  const errors = watchErrors(page)
  await english(page)
  await openConnection(page)
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(dialog.getByTestId('connection-state')).toContainText('Connected')
  await expect(dialog.getByTestId('connection-state')).toContainText('0306')
  await expect(dialog.getByTestId('connection-state')).toContainText('257')
  await dialog.getByRole('button', { name: 'Disconnect' }).click()
  await expect(dialog.getByTestId('connection-state')).toContainText('Disconnected')
  expect(errors).toEqual([])
})

test('pairs with the card token and toggles playback there and back', async ({ page }) => {
  test.skip(!TOKEN, 'E2E_TOKEN is required against a real gateway')
  const errors = watchErrors(page)
  await english(page)
  await connectAndPair(page)
  const toggle = page.getByTestId('toggle')
  await expect(toggle).toBeEnabled()
  const before = await toggle.getAttribute('aria-label')
  await toggle.click()
  await expect(toggle).not.toHaveAttribute('aria-label', before ?? '')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-label', before ?? '')
  await disconnect(page)
  expect(errors).toEqual([])
})

test('plays the featured album from Home with a verified result', async ({ page }) => {
  test.skip(!TOKEN, 'E2E_TOKEN is required against a real gateway')
  const errors = watchErrors(page)
  await english(page)
  const play = page.getByRole('button', { name: 'Play album' })
  test.skip((await play.isDisabled()) && external, 'The collection has no album to feature')
  await connectAndPair(page)
  const featured = await page.getByRole('region', { name: 'Album from your collection' }).locator('p').textContent()
  await play.click()
  await expect(page.getByRole('status').filter({ hasText: 'Done. Verified on DISC.' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('toggle')).toHaveAttribute('aria-label', 'Pause')
  expect(featured).toBeTruthy()
  await disconnect(page)
  expect(errors).toEqual([])
})

test('plays a track from an album page and shows it in Now Playing and Queue', async ({ page }) => {
  test.skip(!TOKEN || external, 'Needs the mock collection and token')
  const errors = watchErrors(page)
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/album/Blue%20Hours')
  await page.getByRole('button', { name: 'Play Window Seat' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Done. Verified on DISC.' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('track-title')).toHaveText('Window Seat')
  // The stock current cover is fetched as bytes and drawn on a canvas (no blob: under the CSP).
  await expect(page.getByRole('region', { name: 'Player' }).locator('canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Open Now Playing panel' }).click()
  const panel = page.getByRole('complementary', { name: 'Player view' })
  await expect(panel.getByRole('heading', { name: 'Window Seat' })).toBeVisible()
  await panel.getByRole('button', { name: 'Queue', exact: true }).click()
  await expect(panel.locator('[aria-current=true]')).toContainText('Window Seat')
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(page.getByRole('button', { name: 'Open Now Playing panel' })).toBeFocused()
  await disconnect(page)
  expect(errors).toEqual([])
})

test('opens track actions and navigates from cards and menus', async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  await english(page)
  await page.goto('/#/albums')
  await page.getByRole('heading', { name: 'Blue Hours' }).getByRole('link').click()
  await expect(page).toHaveURL(/#\/album\/Blue%20Hours$/)
  await page.getByRole('button', { name: 'Track actions: Window Seat' }).click()
  const menu = page.getByRole('dialog', { name: 'Track actions' })
  await expect(menu.getByRole('menuitem', { name: 'Go to album' })).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'Go to artist' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/artist\/Mira%20Sol$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Mira Sol' })).toBeVisible()
})

test('keeps the reference layout on a phone without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await english(page)
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Albums' })).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})
