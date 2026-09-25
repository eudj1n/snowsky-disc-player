import { expect, test, type Locator, type Page } from '@playwright/test'

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
  // On phones the listening panel covers the top bar; minimize it first.
  if (await page.getByRole('complementary', { name: 'Player view' }).isVisible()) await page.keyboard.press('Escape')
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
  await expect(page).toHaveURL(/#\/album\/Blue%20Hours\/Mira%20Sol$/)
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

test('keeps albums that share a title apart by artist and offers more by the artist', async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  await english(page)
  await page.goto('/#/album/Afterglow')
  const scopes = page.getByRole('navigation', { name: 'Albums with this title' })
  await expect(scopes.getByRole('link', { name: 'All artists' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('row')).toHaveCount(7)
  await scopes.getByRole('link', { name: 'Mira Sol' }).click()
  await expect(page).toHaveURL(/#\/album\/Afterglow\/Mira%20Sol$/)
  await expect(page.getByRole('button', { name: 'Play Late Train' })).toBeVisible()
  await expect(page.getByRole('row')).toHaveCount(2)
  const more = page.getByRole('region', { name: 'More by Mira Sol' })
  await expect(more.getByRole('heading', { name: 'Blue Hours' })).toBeVisible()
  await scopes.getByRole('link', { name: 'Northline' }).click()
  await expect(page.getByRole('row')).toHaveCount(5)
  await expect(
    page.getByRole('region', { name: 'More by Northline' }).getByRole('heading', { name: 'Night Drive' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '← Northline' }).click()
  await expect(page).toHaveURL(/#\/artist\/Northline$/)
})

test('connects on the first Play when paired, then follows keyboard shortcuts', async ({ page }) => {
  test.skip(!TOKEN || external, 'Needs the mock collection and token')
  const errors = watchErrors(page)
  await english(page)
  await openConnection(page)
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Pairing token').fill(TOKEN ?? '')
  await dialog.getByRole('button', { name: 'Pair' }).click()
  await page.keyboard.press('Escape')
  await page.goto('/#/album/Inner%20Space')
  await page.getByRole('button', { name: 'Play Weightless' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Done. Verified on DISC.' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('track-title')).toHaveText('Weightless')
  await page.locator('main').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Space')
  await expect(page.getByTestId('toggle')).toHaveAttribute('aria-label', 'Play')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('track-title')).toHaveText('Inner Space')
  await disconnect(page)
  expect(errors).toEqual([])
})

test('sorts albums with chips and remembers the choice', async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  await english(page)
  await page.goto('/#/albums')
  await page.getByRole('button', { name: 'Title' }).click()
  const first = page.getByRole('article').first().getByRole('heading')
  await expect(first).toHaveText('Afterglow')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Title' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Artist' }).click()
  await expect(first).toHaveText('Inner Space')
})

test.describe('player controls on the mock', () => {
  test.skip(() => !TOKEN || external, 'Needs the mock player and token')

  async function openPanel(page: Page, section: 'Open Now Playing panel' | 'Open queue') {
    await page.getByRole('button', { name: section }).click()
    return page.getByRole('complementary', { name: 'Player view' })
  }

  async function flips(page: Page, button: Locator): Promise<void> {
    const before = await button.getAttribute('aria-pressed')
    await button.click()
    await expect(button).not.toHaveAttribute('aria-pressed', before ?? '', { timeout: 15_000 })
  }

  test('volume, modes and favorite are sent once and verified', async ({ page }, info) => {
    await english(page)
    await connectAndPair(page)
    const panel = await openPanel(page, 'Open Now Playing panel')
    const value = info.project.name === 'phone' ? '70' : '60'
    await panel.getByRole('slider', { name: 'Player volume' }).fill(value)
    await expect(page.getByRole('status').filter({ hasText: 'Done. Verified on DISC.' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(panel.locator('output')).toHaveText(value)
    await flips(page, panel.getByRole('button', { name: 'Shuffle' }))
    await flips(page, panel.getByRole('button', { name: 'Favorite track' }))
    await disconnect(page)
  })

  test('the volume icon mutes and restores the earlier level', async ({ page }) => {
    await english(page)
    await connectAndPair(page)
    const panel = await openPanel(page, 'Open Now Playing panel')
    const output = panel.locator('output')
    if ((await output.textContent()) === '0') {
      await panel.getByRole('button', { name: 'Unmute' }).click()
      await expect(output).not.toHaveText('0', { timeout: 15_000 })
    }
    const before = (await output.textContent()) ?? ''
    await panel.getByRole('button', { name: 'Mute' }).click()
    await expect(output).toHaveText('0', { timeout: 15_000 })
    await panel.getByRole('button', { name: 'Unmute' }).click()
    await expect(output).toHaveText(before, { timeout: 15_000 })
    await disconnect(page)
  })

  test("plays one artist's release of a shared title and confirms it", async ({ page }) => {
    await english(page)
    await connectAndPair(page)
    await page.goto('/#/album/Afterglow/Mira%20Sol')
    await page.getByRole('button', { name: 'Play album' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Done. Verified on DISC.' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByTestId('track-title')).toHaveText('Late Train')
    await disconnect(page)
  })

  test('a paused seek waits and confirms after playback resumes', async ({ page }) => {
    await english(page)
    await connectAndPair(page)
    const panel = await openPanel(page, 'Open Now Playing panel')
    const pause = panel.getByRole('button', { name: 'Pause', exact: true })
    if (await pause.isVisible()) {
      await pause.click()
      await expect(panel.getByRole('button', { name: 'Play', exact: true })).toBeVisible({ timeout: 15_000 })
    }
    const slider = panel.getByRole('slider', { name: 'Seek position' })
    await slider.dispatchEvent('pointerdown')
    await slider.fill('90')
    await expect(panel.getByRole('status').filter({ hasText: 'Seek to 1:30 sent' })).toBeVisible({ timeout: 15_000 })
    await panel.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(panel.getByRole('status').filter({ hasText: 'Position confirmed' })).toBeVisible({ timeout: 15_000 })
    await disconnect(page)
  })

  test('selects a row in the queue and plays a playlist', async ({ page }) => {
    await english(page)
    await connectAndPair(page)
    await page.goto('/#/album/Afterglow')
    await page.getByRole('button', { name: 'Play album' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Done. Verified on DISC.' })).toBeVisible({
      timeout: 15_000,
    })
    const panel = await openPanel(page, 'Open queue')
    await panel.getByRole('button', { name: 'Select in queue Soft Focus' }).click()
    await expect(panel.locator('[aria-current=true]')).toContainText('Soft Focus', { timeout: 15_000 })
    await page.keyboard.press('Escape')
    await page.goto('/#/playlist/2')
    await page.getByRole('button', { name: 'Listen' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Done. Verified on DISC.' })).toBeVisible({
      timeout: 15_000,
    })
    await disconnect(page)
  })

  test('sound settings read on opening, apply at once or with Apply, and verify', async ({ page }, info) => {
    await english(page)
    await connectAndPair(page)
    await page.getByRole('button', { name: 'Sound settings' }).filter({ visible: true }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByTestId('sound-feedback')).toHaveText('Current values received from DISC.')
    const gain = dialog.getByRole('group', { name: 'Gain' })
    const target =
      (await gain.getByRole('button', { name: 'High' }).getAttribute('aria-pressed')) === 'true' ? 'Low' : 'High'
    await gain.getByRole('button', { name: target }).click()
    await expect(dialog.getByTestId('sound-feedback')).toHaveText('The player confirmed the new value.', {
      timeout: 15_000,
    })
    await expect(gain.getByRole('button', { name: target })).toHaveAttribute('aria-pressed', 'true')
    await dialog.getByRole('slider', { name: 'Channel balance' }).fill(info.project.name === 'phone' ? '4' : '-5')
    await expect(dialog.getByTestId('sound-feedback')).toHaveText(/not been sent yet/)
    await dialog.getByRole('button', { name: 'Apply' }).first().click()
    await expect(dialog.getByTestId('sound-feedback')).toHaveText('The player confirmed the new value.', {
      timeout: 15_000,
    })
    await page.keyboard.press('Escape')
    await disconnect(page)
  })

  test('imports files, scans once and shows them in New', async ({ page }, info) => {
    await english(page)
    await connectAndPair(page)
    const tag = `${info.project.name} ${Date.now()}`
    await page.getByRole('button', { name: 'Add music' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input[type=file]:not([webkitdirectory])').setInputFiles([
      { name: `Fresh Tune ${tag}.flac`, mimeType: 'audio/flac', buffer: Buffer.from('fLaC-one') },
      { name: `Second Tune ${tag}.flac`, mimeType: 'audio/flac', buffer: Buffer.from('fLaC-two') },
    ])
    await expect(dialog.getByTestId('import-flow')).toHaveText(/selection is ready/)
    await dialog.getByRole('button', { name: 'Transfer to DISC' }).click()
    await expect(dialog.getByTestId('import-flow')).toHaveText(/confirmed files are on the card/, { timeout: 20_000 })
    await dialog.getByRole('button', { name: 'Start scan' }).click()
    await expect(dialog.getByTestId('scan-status')).toContainText('Scan ended', { timeout: 20_000 })
    await expect(dialog.getByTestId('import-flow')).toHaveText(/collection is up to date/, { timeout: 20_000 })
    await dialog.getByRole('button', { name: 'Open New' }).click()
    await expect(page.getByRole('button', { name: `Play Fresh Tune ${tag}` })).toBeVisible()
    await disconnect(page)
  })
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
