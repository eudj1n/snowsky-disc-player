import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  connectAndPair,
  disconnect,
  english,
  external,
  LANGUAGES,
  openConnection,
  SERIAL,
  watchErrors,
  PAIRING_FIELD,
} from './helpers'

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

test('a connected tab reconnects after a reload; after Disconnect it waits', async ({ page }) => {
  test.skip(external, 'Needs the mock gateway')
  await english(page)
  await connectAndPair(page)
  await page.reload()
  await openConnection(page)
  await expect(page.getByRole('dialog').getByTestId('connection-state')).toContainText('Connected', {
    timeout: 15_000,
  })
  await page.keyboard.press('Escape')
  await disconnect(page)
  await page.reload()
  await page.waitForTimeout(2_000)
  await openConnection(page)
  await expect(page.getByRole('dialog').getByTestId('connection-state')).not.toContainText('Connected')
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

test('pairs with the serial number and toggles playback there and back', async ({ page }) => {
  test.skip(!SERIAL, 'E2E_SERIAL is required against a real gateway')
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
  test.skip(!SERIAL, 'E2E_SERIAL is required against a real gateway')
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
  test.skip(!SERIAL || external, 'Needs the mock collection and a serial number')
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
  // Queue rows show the album's cover (their paths come from the persisted queue), not the sleeve.
  const rows = panel.getByRole('listitem')
  await expect(rows).toHaveCount(4)
  await expect(rows.locator('[data-cover=true] canvas')).toHaveCount(4, { timeout: 15_000 })
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
  await expect(menu.getByRole('menuitem', { name: 'Add to playlist' })).toBeVisible()
  // Play, Add to playlist, Go to album, Go to artist.
  await page.keyboard.press('ArrowDown')
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
  // The chosen artist again returns to the whole title.
  await scopes.getByRole('link', { name: 'Northline' }).click()
  await expect(page).toHaveURL(/#\/album\/Afterglow$/)
  await expect(scopes.getByRole('link', { name: 'All artists' })).toHaveAttribute('aria-current', 'page')
  await scopes.getByRole('link', { name: 'Northline' }).click()
  await page.getByRole('button', { name: '← Northline' }).click()
  await expect(page).toHaveURL(/#\/artist\/Northline$/)
  // One release with a guest: clearing the artist leaves nothing to choose, so the choice closes.
  await page.goto('/#/album/Two%20Rooms/Kite%20Lines')
  await scopes.getByRole('link', { name: 'Kite Lines', exact: true }).click()
  await expect(page).toHaveURL(/#\/album\/Two%20Rooms$/)
  await expect(scopes).toHaveCount(0)
})

test('browses genres, narrows mixed albums and filters tracks by genre', async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  await english(page)
  await page.goto('/#/genres')
  await page.getByRole('link', { name: /^Jazz\b/ }).click()
  await expect(page).toHaveURL(/#\/genre\/Jazz$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Jazz' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Artists' }).getByRole('heading', { name: 'Mira Sol' })).toBeVisible()
  // The heading counts the genre's artists too; an artist's card counts albums, as its page shows them.
  await expect(page.getByRole('main')).toContainText(/\d+ albums? · \d+ artists? · \d+ tracks?/)
  await expect(
    page.getByRole('list', { name: 'Artists' }).getByRole('listitem').filter({ hasText: 'Mira Sol' }),
  ).toContainText(/\d+ albums?$/)
  await page
    .getByRole('list', { name: 'Albums' })
    .getByRole('heading', { name: 'Velvet Season' })
    .getByRole('link')
    .click()
  await expect(page).toHaveURL(/#\/album\/Velvet%20Season\?genre=Jazz$/)
  await expect(page.getByRole('row')).toHaveCount(1)
  await page.getByRole('link', { name: 'Whole album' }).click()
  await expect(page.getByRole('row')).toHaveCount(4)
  await page.goto('/#/tracks?genre=Jazz')
  // Seven Jazz tracks and the header row.
  await expect(page.getByRole('row')).toHaveCount(8)
  await page.getByRole('combobox', { name: 'Genre' }).selectOption('Soul')
  await expect(page).toHaveURL(/genre=Soul$/)
  await expect(page.getByRole('row')).toHaveCount(4)
})

test('browses the saved copy while the player is unreachable and recovers', async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  await english(page)
  await page.goto('/#/albums')
  await expect(page.getByRole('heading', { name: 'Blue Hours' })).toBeVisible()
  await page.route('**/api/**', (route) => route.abort())
  await page.reload()
  const notice = page.getByRole('status').filter({ hasText: 'The DISC is unreachable' })
  await expect(notice).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Blue Hours' })).toBeVisible()
  await page.unroute('**/api/**')
  await notice.getByRole('button', { name: 'Try again' }).click()
  await expect(notice).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Blue Hours' })).toBeVisible()
})

test('loads covers and missing durations from the card media', async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  await english(page)
  await page.goto('/#/albums')
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Inner Space' }) })
  await expect(card.locator('canvas')).toHaveCount(1, { timeout: 15_000 })
  // The database has no durations for this album; the files do.
  await page.goto(
    '/#/album/%D0%A2%D0%B8%D1%85%D0%B8%D0%B9%20%D0%BE%D0%BA%D0%B5%D0%B0%D0%BD/%D0%91%D0%B5%D1%80%D0%B5%D0%B3',
  )
  await expect(page.getByRole('row').first()).toContainText(/\d:\d\d/, { timeout: 15_000 })
})

test('lists same-titled albums apart, separates discs, shows years and joint credits', async ({ page }, info) => {
  test.skip(external, 'Needs the mock collection')
  await english(page)
  await page.goto('/#/albums')
  const afterglow = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Afterglow' }) })
  await expect(afterglow).toHaveCount(2)
  await afterglow.filter({ hasText: 'Mira Sol' }).getByRole('link', { name: 'Afterglow' }).first().click()
  await expect(page).toHaveURL(/#\/album\/Afterglow\/Mira%20Sol$/)
  await expect(page.getByRole('row')).toHaveCount(2)

  // A guest on one track leaves the album its lead artist's, without title filters.
  const twoRooms = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Two Rooms' }) })
  await page.goto('/#/albums')
  await expect(twoRooms.getByRole('link', { name: 'Kite Lines' })).toBeVisible()
  await page.goto('/#/album/Two%20Rooms')
  await expect(page.getByRole('navigation', { name: 'Albums with this title' })).toHaveCount(0)
  await expect(page.getByRole('rowheader')).toHaveText(['Disc 1', 'Disc 2'])
  await expect(page.getByRole('main')).toContainText('2021', { timeout: 15_000 })
  const hallway = page.getByRole('row').filter({ hasText: 'Hallway' })
  await expect(hallway.getByRole('link', { name: 'Kite Lines' })).toBeVisible()
  // Only the guest's row names who plays; the album artist's own rows leave it out.
  await expect(page.getByRole('row').filter({ hasText: 'Opening' }).getByRole('link')).toHaveCount(0)
  await expect(page.getByRole('row').filter({ hasText: 'Encore' })).not.toContainText('Kite Lines')
  await hallway.getByRole('link', { name: 'Mira Sol' }).click()
  await expect(page).toHaveURL(/#\/artist\/Mira%20Sol$/)
  await expect(
    page.getByRole('region', { name: 'Appears on' }).getByRole('heading', { name: 'Two Rooms' }),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: 'Albums' }).getByRole('heading', { name: 'Blue Hours' })).toBeVisible()

  // Genre artists split joint credits; a name known only from them has nothing of its own to play.
  await page.goto('/#/genre/Alternative')
  await expect(page.getByRole('heading', { name: 'Mira Sol', exact: true })).toBeVisible()
  await expect(page.getByText('Kite Lines; Mira Sol')).toHaveCount(0)
  // Cover play buttons exist only where the pointer can hover (not on phones).
  if (info.project.name === 'desktop') {
    await expect(page.getByRole('button', { name: 'Play Mira Sol' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Play Kite Lines' })).toHaveCount(1)
  }
})

test('shows genre spellings that differ only in case and spacing as one genre', async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  await english(page)
  await page.goto('/#/genres')
  await expect(page.getByRole('link', { name: /^\s*alternative/i })).toHaveCount(1)
  await page.getByRole('link', { name: /^\s*Alternative/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Alternative' })).toBeVisible()
  // Its albums come from every spelling; the note names them and the one stock plays.
  await expect(page.getByRole('heading', { name: 'Two Rooms' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Daybreak' })).toBeVisible()
  await expect(page.getByTestId('genre-spellings')).toContainText('“alternative ”')
  await expect(page.getByTestId('genre-spellings')).toContainText('at a time: “Alternative” here')
  // An older link with another spelling opens the same genre.
  await page.goto('/#/genre/alternative%20')
  await expect(page.getByRole('heading', { level: 1, name: 'Alternative' })).toBeVisible()
})

test('pairs with the player serial number, typed with spaces', async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  await english(page)
  await openConnection(page)
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('SN under About device')).toBeVisible()
  await dialog.getByLabel('Serial number', { exact: true }).fill('0000 0000 0000 00')
  await dialog.getByRole('button', { name: 'Pair' }).click()
  await expect(dialog.getByTestId('paired')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.goto('/#/album/Inner%20Space')
  await page.getByRole('button', { name: 'Play Weightless' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Done. Verified on DISC.' })).toBeVisible({ timeout: 15_000 })
  await disconnect(page)
})

test('forgets a credential the player refuses at once', async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  await english(page)
  await openConnection(page)
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Serial number', { exact: true }).fill('1111 1111 1111 11')
  await dialog.getByRole('button', { name: 'Pair' }).click()
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(dialog.getByText('did not accept the saved serial number')).toBeVisible()
  await expect(dialog.getByLabel('Serial number', { exact: true })).toBeVisible()
})

test('connects on the first Play when paired, then follows keyboard shortcuts', async ({ page }) => {
  test.skip(!SERIAL || external, 'Needs the mock collection and a serial number')
  const errors = watchErrors(page)
  await english(page)
  await openConnection(page)
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(PAIRING_FIELD).fill(SERIAL ?? '')
  await dialog.getByRole('button', { name: 'Pair' }).click()
  await page.keyboard.press('Escape')
  await page.goto('/#/album/Inner%20Space')
  await page.getByRole('button', { name: 'Play Weightless' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Done. Verified on DISC.' })).toBeVisible({ timeout: 15_000 })
  // A confirmation the page already shows is announced, not drawn.
  await expect(page.getByTestId('toast')).toHaveAttribute('data-quiet', 'true')
  await expect(page.getByTestId('track-title')).toHaveText('Weightless')
  await page.locator('main').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Space')
  await expect(page.getByTestId('toggle')).toHaveAttribute('aria-label', 'Play')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('track-title')).toHaveText('Inner Space')
  // The stock follows a switch with a partial {"state":0}; the player stays.
  await page.waitForTimeout(600)
  await expect(page.getByTestId('track-title')).toHaveText('Inner Space')
  await expect(page.getByTestId('toggle')).toBeEnabled()
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
  test.skip(() => !SERIAL || external, 'Needs the mock player and a serial number')

  async function openPanel(page: Page, section: 'Open Now Playing panel' | 'Open queue') {
    await page.getByRole('button', { name: section }).click()
    return page.getByRole('complementary', { name: 'Player view' })
  }

  async function flips(page: Page, button: Locator): Promise<void> {
    const before = await button.getAttribute('aria-pressed')
    await button.click()
    await expect(button).not.toHaveAttribute('aria-pressed', before ?? '', { timeout: 15_000 })
  }

  test('keeps the controls usable while the player confirms, and a press meanwhile follows', async ({ page }) => {
    await english(page)
    await connectAndPair(page)
    await page.goto('/#/album/Blue%20Hours/Mira%20Sol')
    await page.getByRole('button', { name: 'Play Almost Sunday' }).click()
    const title = page.getByTestId('track-title')
    await expect(title).toHaveText('Almost Sunday', { timeout: 15_000 })
    const player = page.getByRole('region', { name: 'Player' })
    const next = player.getByRole('button', { name: 'Next track' })
    const working = page.getByTestId('player-working')
    // Nothing locks while the player confirms: a second press waits its turn (pacing) and follows.
    await next.click()
    await expect(working).toBeAttached()
    await expect(next).toBeEnabled()
    await expect(page.getByTestId('toggle')).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Play Window Seat' })).toBeEnabled()
    await next.click()
    await expect(title).toHaveText('An Open Door', { timeout: 20_000 })
    await expect(working).toHaveCount(0, { timeout: 15_000 })
    await expect(page.getByRole('status').filter({ hasText: 'Please wait' })).toHaveCount(0)
    await disconnect(page)
  })

  test('keeps at most four album columns with the listening panel open on a large screen', async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'The listening panel reserves space from 1200px')
    await page.setViewportSize({ width: 1920, height: 1080 })
    await english(page)
    await connectAndPair(page)
    await page.goto('/#/albums')
    const grid = page.getByRole('article').first().locator('..')
    const columns = () => grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)
    expect(await columns()).toBe(4)
    await openPanel(page, 'Open queue')
    await expect(page.locator('.listening-open')).toHaveCount(1)
    expect(await columns()).toBe(4)
    // A narrower window with the panel fits fewer, never tiny, cards.
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect.poll(columns).toBeLessThanOrEqual(4)
    const width = await page
      .getByRole('article')
      .first()
      .evaluate((element) => element.getBoundingClientRect().width)
    expect(width).toBeGreaterThanOrEqual(145)
    await disconnect(page)
  })

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

  test('a track liked in the player appears in Favorites at once', async ({ page }) => {
    await english(page)
    await connectAndPair(page)
    const title = ((await page.getByTestId('track-title').textContent()) ?? '').trim()
    const panel = await openPanel(page, 'Open Now Playing panel')
    const heart = panel.getByRole('button', { name: 'Favorite track' })
    if ((await heart.getAttribute('aria-pressed')) === 'true') await flips(page, heart)
    await flips(page, heart)
    await page.keyboard.press('Escape')
    await page.goto('/#/favorites')
    await expect(page.getByRole('row').filter({ hasText: title })).not.toHaveCount(0)
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

    // Muting right after a verified change keeps the new level for Unmute.
    const level = before === '37' ? '38' : '37'
    const toast = page.getByTestId('toast')
    await expect(toast).toBeHidden({ timeout: 15_000 })
    await panel.getByRole('slider', { name: 'Player volume' }).fill(level)
    await expect(toast).toHaveText('Done. Verified on DISC.', { timeout: 15_000 })
    await panel.getByRole('button', { name: 'Mute' }).click()
    await expect(output).toHaveText('0', { timeout: 15_000 })
    await panel.getByRole('button', { name: 'Unmute' }).click()
    await expect(output).toHaveText(level, { timeout: 15_000 })
    await panel.getByRole('slider', { name: 'Player volume' }).fill(before)
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

  test('plays a whole artist from its page', async ({ page }) => {
    await english(page)
    await connectAndPair(page)
    await page.goto('/#/artist/Northline')
    await page.getByTestId('play-artist').click()
    await expect(page.getByRole('status').filter({ hasText: 'Done. Verified on DISC.' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByRole('region', { name: 'Player' }).getByRole('link', { name: 'Northline' })).toBeVisible()
    await disconnect(page)
  })

  test('plays an album from its cover and a whole genre', async ({ page }, info) => {
    await english(page)
    await connectAndPair(page)
    if (info.project.name !== 'phone') {
      await page.goto('/#/albums')
      const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Inner Space' }) })
      await card.hover()
      await card.getByRole('button', { name: 'Play Inner Space' }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Done. Verified on DISC.' })).toBeVisible({
        timeout: 15_000,
      })
      await expect(page.getByTestId('track-title')).toHaveText('Orbit')
    }
    await page.goto('/#/genre/Jazz')
    await page.getByRole('button', { name: 'Play genre' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Done. Verified on DISC.' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByTestId('track-title')).toHaveText('Blue Hours')
    if (info.project.name !== 'phone') {
      const bar = page.getByRole('region', { name: 'Player' })
      await expect(bar.getByRole('link', { name: 'Genre: Jazz' })).toBeVisible()
    }
    await disconnect(page)
  })

  test('creates, fills, trims, renames and deletes a playlist', async ({ page }, info) => {
    await english(page)
    await connectAndPair(page)
    const verified = page.getByRole('status').filter({ hasText: 'Done. Verified on DISC.' })
    const name = `E2E ${info.project.name} ${String(Date.now() % 100_000)}`
    const dialog = page.getByRole('dialog')
    await page.goto('/#/playlists')
    await page.getByRole('button', { name: 'New playlist' }).click()
    await dialog.getByLabel('Playlist name').fill(name)
    await dialog.getByRole('button', { name: 'Create' }).click()
    await expect(verified).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()

    await page.goto('/#/album/Inner%20Space/Forma')
    await page.getByRole('button', { name: 'Add to playlist' }).click()
    await dialog.getByRole('combobox').selectOption(name)
    await dialog.getByRole('button', { name: 'Add to playlist' }).click()
    await expect(dialog).toBeHidden({ timeout: 20_000 })

    await page.goto('/#/playlists')
    await page.getByRole('heading', { name, exact: true }).getByRole('link').click()
    await expect(page.getByRole('row')).toHaveCount(4)
    await page.getByRole('button', { name: 'Track actions: Orbit' }).click()
    await page.getByRole('menuitem', { name: 'Remove from playlist' }).click()
    await dialog.getByRole('button', { name: 'Remove' }).click()
    await expect(dialog).toBeHidden({ timeout: 20_000 })
    await expect(page.getByRole('row')).toHaveCount(3)

    await page.getByRole('button', { name: 'Rename' }).click()
    await dialog.getByLabel('Playlist name').fill(`${name} R`)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { level: 1, name: `${name} R` })).toBeVisible({ timeout: 20_000 })

    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page).toHaveURL(/#\/playlists$/, { timeout: 20_000 })
    await expect(page.getByRole('heading', { name: `${name} R`, exact: true })).toHaveCount(0)
    await disconnect(page)
  })

  test('selects a custom EQ preset and keeps an edited band on the player', async ({ page }, info) => {
    await english(page)
    await connectAndPair(page)
    const open = async () => {
      await page.getByRole('button', { name: 'Sound settings' }).filter({ visible: true }).first().click()
      await expect(page.getByRole('dialog').getByTestId('sound-feedback')).toHaveText(
        'Current values received from DISC.',
      )
    }
    await open()
    const dialog = page.getByRole('dialog')
    const panel = dialog.getByRole('region', { name: 'Equalizer' })
    const preset = panel.getByRole('combobox', { name: 'Preset' })
    await expect(preset).toBeEnabled()
    const target = (await preset.inputValue()) === '161' ? '162' : '161'
    await preset.selectOption(target)
    await expect(dialog.getByTestId('eq-feedback')).toHaveText('The player confirmed the new value.', {
      timeout: 15_000,
    })
    const gain = info.project.name === 'phone' ? '4' : '3'
    await panel.getByRole('slider', { name: '1k Hz gain' }).fill(gain)
    await panel.getByRole('button', { name: 'Apply' }).click()
    await expect(panel.getByRole('button', { name: 'Apply' })).toBeDisabled({ timeout: 15_000 })
    await expect(dialog.getByTestId('eq-feedback')).toHaveText('The player confirmed the new value.')
    await page.keyboard.press('Escape')
    await open()
    await expect(panel.getByRole('slider', { name: '1k Hz gain' })).toHaveValue(gain)
    await page.keyboard.press('Escape')
    await disconnect(page)
  })

  test('shows the lyrics of the current track, synced with its position', async ({ page }) => {
    await english(page)
    await connectAndPair(page)
    await page.goto('/#/album/Inner%20Space/Forma')
    await page.getByRole('button', { name: 'Play Weightless' }).click()
    await expect(page.getByTestId('track-title')).toHaveText('Weightless', { timeout: 15_000 })
    await page.getByRole('button', { name: 'Lyrics' }).filter({ visible: true }).first().click()
    const lyrics = page.getByTestId('lyrics')
    await expect(lyrics.getByRole('button', { name: 'Weightless, first line' })).toBeVisible({ timeout: 15_000 })
    await expect(lyrics.locator('[aria-current=true]')).toHaveCount(1, { timeout: 15_000 })
    await expect(lyrics).toContainText('From the .lrc file beside the track')
    // Paused, away and back: the tab opens at the current line.
    await page.getByTestId('toggle').click()
    await expect(page.getByTestId('toggle')).toHaveAttribute('aria-label', 'Play', { timeout: 15_000 })
    const panel = page.getByRole('complementary', { name: 'Player view' })
    await panel.getByRole('button', { name: 'Now Playing', exact: true }).click()
    await panel.getByRole('button', { name: 'Lyrics', exact: true }).click()
    await expect(page.getByTestId('lyrics').locator('[aria-current=true]')).toBeInViewport()
    await page.keyboard.press('Escape')
    await disconnect(page)
  })

  test('shows the collection size, battery, card space and audio quality', async ({ page }) => {
    await english(page)
    await connectAndPair(page)
    await openConnection(page)
    const facts = page.getByRole('dialog').getByTestId('player-facts')
    // The live gauge (72 %), not what stock last stored (87 %), and the card's space.
    await expect(facts).toContainText('Battery72%')
    await expect(facts).toContainText('Card18 GB free of 64 GB')
    // The card is a full-width bar of the used space: 71 % used, colored as plenty left.
    const meter = facts.getByRole('meter', { name: 'Card space used' })
    await expect(meter).toHaveAttribute('aria-valuenow', '71')
    await expect(meter).toHaveAttribute('data-level', 'ok')
    await expect(facts).toContainText(/Albums\d+/)
    await expect(facts).toContainText(/Tracks\d+/)
    await page.keyboard.press('Escape')
    await page.goto('/#/album/Inner%20Space/Forma')
    await expect(page.getByTestId('album-quality')).toHaveText('FLAC 16/44.1', { timeout: 15_000 })
    await page.getByRole('button', { name: 'Play Weightless' }).click()
    await expect(page.getByTestId('track-title')).toHaveText('Weightless', { timeout: 15_000 })
    const panel = await openPanel(page, 'Open Now Playing panel')
    await expect(panel.getByTestId('quality')).toHaveText(/Hi-Res\s*FLAC · 24\/96/)
    // The DAC gets 48 kHz here: the 96 kHz file is resampled on its way out.
    await expect(panel.getByTestId('output-rate')).toHaveText('→ 48 kHz', { timeout: 15_000 })
    await page.keyboard.press('Escape')
    await disconnect(page)
  })

  test('favorites a track that is not playing from its row', async ({ page }, info) => {
    // The mock player is shared by both projects: each favorites its own track.
    const title = info.project.name === 'desktop' ? 'Side by Side' : 'In Between'
    await english(page)
    await connectAndPair(page)
    await page.goto('/#/album/Patterns/Parallel%20Lines')
    const row = page.getByRole('row').filter({ hasText: title })
    await row.hover()
    await row.getByRole('button', { name: `Add to favorites: ${title}` }).click()
    // Now a favorite; one that is not playing can be removed from its row.
    await expect(row.getByRole('button', { name: `Remove from favorites: ${title}` })).toBeAttached({ timeout: 15_000 })
    await page.goto('/#/favorites')
    await expect(page.getByRole('row').filter({ hasText: title })).toHaveCount(1)
    await disconnect(page)
  })

  test('links each artist of a joint credit in the listening panel', async ({ page }) => {
    await english(page)
    await connectAndPair(page)
    await page.goto('/#/album/Two%20Rooms')
    await page.getByRole('button', { name: 'Play Hallway' }).click()
    await expect(page.getByTestId('track-title')).toHaveText('Hallway', { timeout: 15_000 })
    const panel = await openPanel(page, 'Open Now Playing panel')
    for (const name of ['Kite Lines', 'Mira Sol'])
      await expect(panel.getByRole('link', { name, exact: true })).toBeVisible()
    await panel.getByRole('button', { name: 'Lyrics', exact: true }).click()
    await expect(panel.getByRole('link', { name: 'Mira Sol', exact: true })).toBeVisible()
    await expect(panel).not.toContainText('Kite Lines; Mira Sol')
    // The tab names the lyrics; the header above them names only the track.
    await expect(panel.getByText('Lyrics', { exact: true })).toHaveCount(1)
    await page.keyboard.press('Escape')
    await disconnect(page)
  })

  test('names a long album in full although the play state cuts it short', async ({ page }) => {
    const album = 'Quiet Meridian (The Complete Anniversary Recordings)'
    await english(page)
    await connectAndPair(page)
    await page.goto(`/#/album/${encodeURIComponent(album)}`)
    await page.getByRole('button', { name: 'Play Meridian Line' }).click()
    const title = page.getByTestId('track-title')
    await expect(title).toHaveText('Meridian Line', { timeout: 15_000 })
    // Confirmed although stock reports the album cut short: its full name is the only one it begins.
    await expect(page.getByRole('status').filter({ hasText: 'Done. Verified on DISC.' })).toBeAttached()
    await page.goto('/#/tracks')
    await title.click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(album)
    await expect(page.getByRole('row').filter({ hasText: 'Meridian Line' })).toHaveCount(1)
    await disconnect(page)
  })

  test('the compact bar plays the page and then pauses and resumes it', async ({ page }) => {
    await english(page)
    await connectAndPair(page)
    // Something from another album first: the mock player is shared by both projects.
    await page.goto('/#/album/Inner%20Space/Forma')
    await page.getByRole('button', { name: 'Play Weightless' }).click()
    await expect(page.getByTestId('track-title')).toHaveText('Weightless', { timeout: 15_000 })
    await page.setViewportSize({ width: page.viewportSize()?.width ?? 1280, height: 520 })
    await page.goto('/#/album/Night%20Drive/Northline')
    await expect(page.getByRole('button', { name: 'Play Last Exit' })).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    const bar = page.getByTestId('sticky-heading')
    await expect(bar).toBeVisible()
    await bar.getByRole('button', { name: 'Play album' }).click()
    await expect(page.getByTestId('track-title')).toHaveText(/Night Drive|City Glow|Last Exit/, { timeout: 15_000 })
    await bar.getByRole('button', { name: 'Pause', exact: true }).click()
    await expect(bar.getByRole('button', { name: 'Play', exact: true })).toBeVisible({ timeout: 15_000 })
    await bar.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(bar.getByRole('button', { name: 'Pause', exact: true })).toBeVisible({ timeout: 15_000 })
    await disconnect(page)
  })

  test('the playing row pauses and resumes instead of starting over', async ({ page }) => {
    await english(page)
    await connectAndPair(page)
    await page.goto('/#/album/Afterglow/Northline')
    await page.getByRole('button', { name: 'Play Soft Focus' }).click()
    await expect(page.getByTestId('track-title')).toHaveText('Soft Focus', { timeout: 15_000 })
    const row = page.getByRole('row').filter({ hasText: 'Soft Focus' })
    await row.getByRole('button', { name: 'Pause Soft Focus' }).click()
    await expect(row.getByRole('button', { name: 'Play Soft Focus' })).toBeAttached({ timeout: 15_000 })
    // The player bar pauses with the row; the row itself keeps naming its track.
    await expect(
      page.getByRole('region', { name: 'Player' }).getByRole('button', { name: 'Play', exact: true }),
    ).toHaveCount(1)
    await expect(row.getByRole('button', { name: 'Play', exact: true })).toHaveCount(0)
    await row.getByRole('button', { name: 'Play Soft Focus' }).click()
    await expect(row.getByRole('button', { name: 'Pause Soft Focus' })).toBeAttached({ timeout: 15_000 })
    await expect(page.getByTestId('track-title')).toHaveText('Soft Focus')
    await disconnect(page)
  })

  test('removes a favorite that is not playing after confirmation', async ({ page }) => {
    await english(page)
    await connectAndPair(page)
    await page.goto('/#/favorites')
    await expect(page.getByRole('row').first()).toBeVisible()
    const heart = page.getByRole('button', { name: /^Remove from favorites: / }).first()
    const label = (await heart.getAttribute('aria-label')) ?? ''
    const title = label.replace('Remove from favorites: ', '')
    // The list may still grow while it loads, so follow this track, not a row count.
    const same = page.getByRole('button', { name: label, exact: true })
    const copies = await same.count()
    await heart.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText(title)
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(dialog).toBeHidden({ timeout: 20_000 })
    await expect(same).toHaveCount(copies - 1, { timeout: 20_000 })
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
    // SPDIF: On asks first (a digital signal on the 3.5 mm jack), Off applies at once.
    const spdif = dialog.getByRole('group', { name: 'SPDIF' })
    await spdif.getByRole('button', { name: 'On' }).click()
    const warning = dialog.getByRole('alert')
    await expect(warning).toContainText('unplug them first')
    await expect(spdif.getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true')
    await warning.getByRole('button', { name: 'Turn on SPDIF' }).click()
    await expect(spdif.getByRole('button', { name: 'On' })).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 })
    await expect(dialog.getByTestId('sound-feedback')).toHaveText('The player confirmed the new value.')
    await spdif.getByRole('button', { name: 'Off' }).click()
    await expect(spdif.getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true', {
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

  test('skips files already on the card and lets the list be trimmed', async ({ page }, info) => {
    await english(page)
    await connectAndPair(page)
    const tag = `${info.project.name} ${Date.now()}`
    const file = (name: string) => ({ name: `${name} ${tag}.flac`, mimeType: 'audio/flac', buffer: Buffer.from(name) })
    await page.getByRole('button', { name: 'Add music' }).click()
    const dialog = page.getByRole('dialog')
    const picker = dialog.locator('input[type=file]:not([webkitdirectory])')
    await picker.setInputFiles([file('A Present')])
    await dialog.getByRole('button', { name: 'Transfer to DISC' }).click()
    await expect(dialog.getByTestId('import-flow')).toHaveText(/confirmed files are on the card/, { timeout: 20_000 })

    // The same file again, sorted first, plus a new one and one taken back out.
    await picker.setInputFiles([file('A Present'), file('B Fresh'), file('C Dropped')])
    await dialog.getByRole('button', { name: `Remove from the list: C Dropped ${tag}.flac` }).click()
    await expect(dialog.getByTestId('import-files')).not.toContainText('C Dropped')
    await dialog.getByRole('button', { name: 'Transfer to DISC' }).click()
    await expect(dialog.getByTestId('import-flow')).toHaveText(/confirmed files are on the card/, { timeout: 20_000 })
    const files = dialog.getByTestId('import-files')
    await expect(files.getByRole('listitem').first()).toContainText('Already on the card: skipped')
    await expect(files.getByRole('listitem').nth(1)).toContainText('On the memory card')
    await expect(dialog.getByText('Already on the card: 1')).toBeVisible()
    await page.keyboard.press('Escape')
    await disconnect(page)
  })

  test('carries lyrics and a folder cover with a folder, skipping other files', async ({ page }, info) => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const tag = `${info.project.name} ${Date.now()}`
    const folder = join(mkdtempSync(join(tmpdir(), 'disc-import-')), `Folder Album ${tag}`)
    mkdirSync(folder)
    for (const [name, body] of [
      ['01 Tide.flac', 'fLaC-tide'],
      ['01 Tide.lrc', '[00:00.00]Tide'],
      ['cover.jpg', 'jpeg'],
      ['back.jpg', 'jpeg'],
      ['notes.txt', 'text'],
    ])
      writeFileSync(join(folder, name), body)
    await english(page)
    await connectAndPair(page)
    await page.getByRole('button', { name: 'Add music' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input[type=file][webkitdirectory]').setInputFiles(folder)
    const files = dialog.getByTestId('import-files')
    await expect(files.getByRole('listitem')).toHaveCount(3)
    await expect(files).toContainText('01 Tide.lrc')
    await expect(files).toContainText('cover.jpg')
    await expect(dialog.getByText('other files skipped: 2')).toBeVisible()
    await dialog.getByRole('button', { name: 'Transfer to DISC' }).click()
    await expect(dialog.getByTestId('import-flow')).toHaveText(/confirmed files are on the card/, { timeout: 20_000 })
    await expect(files.getByRole('listitem').filter({ hasText: 'On the memory card' })).toHaveCount(3)
    await page.keyboard.press('Escape')
    await disconnect(page)
  })

  test('sends a refused file again only on request', async ({ page }, info) => {
    await english(page)
    await connectAndPair(page)
    const tag = `${info.project.name} ${Date.now()}`
    await page.getByRole('button', { name: 'Add music' }).click()
    const dialog = page.getByRole('dialog')
    await dialog
      .locator('input[type=file]:not([webkitdirectory])')
      .setInputFiles([{ name: `Busy Once ${tag}.flac`, mimeType: 'audio/flac', buffer: Buffer.from('fLaC-busy') }])
    await dialog.getByRole('button', { name: 'Transfer to DISC' }).click()
    await expect(dialog.getByTestId('import-flow')).toHaveText(/Transfer stopped/, { timeout: 20_000 })
    // A refusal stays on screen.
    await expect(page.getByTestId('toast')).toHaveAttribute('data-quiet', 'false')
    await expect(dialog.getByRole('button', { name: 'Transfer to DISC' })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Send again' }).click()
    await dialog.getByRole('button', { name: 'Transfer to DISC' }).click()
    await expect(dialog.getByTestId('import-flow')).toHaveText(/confirmed files are on the card/, { timeout: 20_000 })
    await page.keyboard.press('Escape')
    await disconnect(page)
  })
})

test('shows what was played last as uniform tiles and a track history with its sources', async ({ page }, info) => {
  test.skip(external, 'Needs the mock collection')
  await english(page)
  const shelf = page.getByRole('region', { name: 'Recently played' })
  // Newest first, each source once; the all-tracks play stays off the shelf, and so does the
  // newest play, from an album deleted since (it is not its artist's either).
  const tiles = shelf.getByRole('listitem')
  await expect(tiles.locator('strong')).toHaveText(['Inner Space', 'Evening', 'Northline', 'Jazz'])
  await expect(tiles.locator('small')).toHaveText(['Album · Forma', 'Playlist · 12 tracks', 'Artist', 'Genre'])
  if (info.project.name === 'desktop') {
    await expect(shelf.getByRole('button', { name: 'Play Jazz' })).toHaveCount(1)
  }
  await shelf.getByRole('link', { name: 'Open Evening' }).click()
  await expect(page).toHaveURL(/#\/playlist\/\d+$/)
  await page.goto('/#/tracks')
  const sort = page.getByRole('group', { name: 'Sort tracks' })
  await sort.getByRole('button', { name: 'Recently played' }).click()
  const rows = page.getByRole('table').getByRole('row')
  await expect(rows.nth(1)).toContainText('Weightless')
  if (info.project.name === 'desktop') {
    // Each played row names where it played from (phones drop the album column).
    await expect(rows.filter({ hasText: 'Almost Sunday' }).getByTestId('source-note')).toHaveText('Genre · Jazz')
    await expect(rows.filter({ hasText: 'First Light' }).getByTestId('source-note')).toHaveText('Playlist · Evening')
  }
  await sort.getByRole('button', { name: 'Library order' }).click()
  await expect(rows.nth(1)).toContainText('First Light')
})

test("shows an artist's most played tracks from the play history, and none before any play", async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  await english(page)
  await page.goto('/#/artist/Forma')
  const hot = page.getByTestId('hot-tracks')
  // The mock history played Inner Space from Orbit, then from Weightless (the later play first).
  await expect(hot.getByRole('heading', { name: 'Most played' })).toBeVisible()
  await expect(hot).toContainText('Weightless')
  await expect(hot).toContainText('Orbit')
  await expect(hot).not.toContainText('Still Here')
  // On the artist's own page a tile names the album, not the artist again.
  await expect(hot.getByRole('link', { name: 'Inner Space' }).first()).toBeVisible()
  await page.goto('/#/artist/Sundial')
  await expect(page.getByRole('heading', { level: 1, name: 'Sundial' })).toBeVisible()
  await expect(page.getByTestId('hot-tracks')).toHaveCount(0)
})

test('keeps a favorite whose file was deleted in place, dimmed and not playable', async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  await english(page)
  await page.goto('/#/favorites')
  const gone = page.getByRole('row').filter({ hasText: 'Gone Song' })
  // Marked for the eye and the screen reader, but not disabled: its heart and menu still work.
  await expect(gone).toHaveAttribute('data-unavailable', 'true')
  await expect(gone).toContainText('Not on the card')
  await expect(gone).toHaveAttribute('title', 'Not on the card')
  await expect(gone.getByRole('button', { name: /^Play / })).toHaveCount(0)
  // The favorites on the card keep their play buttons.
  await expect(
    page
      .getByRole('main')
      .getByRole('button', { name: /^Play / })
      .first(),
  ).toBeVisible()
  // Its menu offers only what needs no file.
  await gone.getByRole('button', { name: 'Track actions: Gone Song' }).click()
  const menu = page.getByRole('dialog', { name: 'Track actions' })
  await expect(menu.getByRole('menuitem', { name: 'Play', exact: true })).toBeDisabled()
  await expect(menu.getByRole('menuitem', { name: 'Add to playlist' })).toBeDisabled()
  await page.keyboard.press('Escape')
})

test('shows a joint album as "A & B", with its first artist\'s albums and its artists', async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  await english(page)
  await page.goto('/#/albums')
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Shared Light' }) })
  await expect(card.getByRole('link', { name: 'Kite Lines & Mira Sol' })).toBeVisible()
  await card.getByRole('link', { name: 'Shared Light' }).first().click()
  await expect(page).toHaveURL(/#\/album\/Shared%20Light\/Kite%20Lines(%3B|;)%20Mira%20Sol$/)
  await expect(page.getByRole('main')).not.toContainText('Kite Lines; Mira Sol')
  // No other album by the pair: the first artist's albums, then the artists themselves.
  await expect(
    page.getByRole('region', { name: 'More by Kite Lines' }).getByRole('heading', { name: 'Two Rooms' }),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: 'More by Kite Lines & Mira Sol' })).toHaveCount(0)
  const members = page.getByRole('region', { name: 'On this album' })
  await expect(members.getByRole('list').getByRole('heading')).toHaveText(['Kite Lines', 'Mira Sol'])
  await members.getByRole('link', { name: 'Mira Sol' }).first().click()
  await expect(page).toHaveURL(/#\/artist\/Mira%20Sol$/)
  await page.goBack()
  // The back link names the pair and opens their page.
  await page.getByRole('button', { name: /Kite Lines & Mira Sol/ }).click()
  await expect(page).toHaveURL(/#\/artist\/Kite%20Lines(%3B|;)%20Mira%20Sol$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kite Lines & Mira Sol')
})

test('links the featured album and its artist on Home without playing', async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  await english(page)
  const hero = page.getByRole('region', { name: 'Album from your collection' })
  const album = hero.getByRole('link').first()
  await expect(album).toBeVisible()
  const title = (await album.textContent()) ?? ''
  await album.click()
  await expect(page).toHaveURL(/#\/album\//)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
  await page.goBack()
  await hero.getByRole('link').nth(1).click()
  await expect(page).toHaveURL(/#\/artist\//)
})

test('places the favorite heart in its own column right before the duration', async ({ page }, info) => {
  test.skip(external, 'Needs the mock collection')
  await english(page)
  await page.goto('/#/tracks')
  const widths = info.project.name === 'desktop' ? [1280, 1000, 760] : [390]
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 })
    const heart = page.getByTitle('In favorites').first()
    await expect(heart).toBeVisible()
    const row = heart.locator('xpath=ancestor::*[@role="row"][1]')
    const box = await heart.boundingBox()
    const rowBox = await row.boundingBox()
    const duration = await row.getByRole('cell').nth(-2).boundingBox()
    const lead = await row.getByRole('cell').first().boundingBox()
    expect(box && rowBox && duration && lead, `width ${width}`).toBeTruthy()
    if (!box || !rowBox || !duration || !lead) continue
    // Inside the row, just left of the duration; the row opens no lane of its own on the left.
    expect(box.x + box.width, `width ${width}`).toBeLessThanOrEqual(duration.x)
    expect(duration.x - (box.x + box.width), `width ${width}`).toBeLessThan(24)
    expect(lead.x - rowBox.x, `width ${width}`).toBeLessThanOrEqual(12)
  }
})

test('draws select arrows inside the rounded edge', async ({ page }) => {
  await english(page)
  await page.goto('/#/tracks')
  for (const select of [
    page.getByRole('combobox', { name: 'Genre' }),
    page.getByRole('combobox', { name: 'Interface language' }),
  ]) {
    await expect(select).toHaveCSS('appearance', 'none')
    const box = await select.boundingBox()
    const arrow = await select.locator('xpath=following-sibling::*[1]').boundingBox()
    expect(box && arrow && box.x + box.width - (arrow.x + arrow.width)).toBeGreaterThanOrEqual(6)
    expect(box && arrow && arrow.x - box.x).toBeGreaterThan(0)
  }
})

test('collapses the sidebar to its icon rail and remembers it', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Phones use the bottom navigation')
  await english(page)
  const sidebar = page.getByRole('complementary', { name: 'Main navigation' })
  const width = async () => (await sidebar.boundingBox())?.width
  const full = await width()
  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  await expect.poll(width).toBe(74)
  await expect(sidebar.getByRole('link', { name: 'Albums' })).toHaveAttribute('title', 'Albums')
  await page.reload()
  // Applied before paint by theme.js, then kept by the store.
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'rail')
  await expect.poll(width).toBe(74)
  await page.getByRole('button', { name: 'Expand sidebar' }).click()
  await expect.poll(width).toBe(full)
  await expect(sidebar.getByRole('link', { name: 'Albums' })).not.toHaveAttribute('title', /.*/)
  // Narrow windows always show the rail and need no toggle.
  await page.setViewportSize({ width: 760, height: 800 })
  await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeHidden()
})

test("keeps the page's context in a compact bar once its header scrolls away", async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  await english(page)
  await page.setViewportSize({ width: page.viewportSize()?.width ?? 1280, height: 520 })
  await page.goto('/#/album/Afterglow/Northline')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Afterglow')
  await expect(page.getByRole('row').filter({ hasText: 'Stay a Little Longer' })).toBeVisible()
  const bar = page.getByTestId('sticky-heading')
  await expect(bar).toHaveCount(0)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expect(bar).toBeVisible()
  await expect(bar.getByRole('link', { name: 'Northline' })).toBeVisible()
  // Not connected: nothing plays from here yet, but the button is there.
  await expect(bar.getByRole('button', { name: 'Play album' })).toBeVisible()
  // The name returns to the top, where the full header takes over again.
  await bar.getByRole('button', { name: 'Afterglow' }).click()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await expect(bar).toHaveCount(0)
})

test('offers the tones of the theme in effect and keeps the chosen palettes', async ({ page }) => {
  await english(page)
  const html = page.locator('html')
  await page
    .getByRole('button', { name: /^Appearance/ })
    .filter({ visible: true })
    .first()
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Dark', exact: true }).click()
  await expect(dialog.getByRole('group', { name: 'Light theme tone' })).toHaveCount(0)
  const dark = dialog.getByRole('group', { name: 'Dark theme tone' })
  await expect(dark.getByRole('button')).toHaveCount(4)
  await dark.getByRole('button', { name: 'Espresso' }).click()
  await expect(html).toHaveAttribute('data-dark-palette', 'espresso')
  await dialog.getByRole('button', { name: 'Light', exact: true }).click()
  await expect(dialog.getByRole('group', { name: 'Dark theme tone' })).toHaveCount(0)
  const light = dialog.getByRole('group', { name: 'Light theme tone' })
  await expect(light.getByRole('button')).toHaveCount(4)
  await light.getByRole('button', { name: 'Paper' }).click()
  await page.reload()
  // Applied before paint by theme.js, then kept by the store.
  await expect(html).toHaveAttribute('data-light-palette', 'paper')
  await expect(html).toHaveAttribute('data-dark-palette', 'espresso')
  await page
    .getByRole('button', { name: /^Appearance/ })
    .filter({ visible: true })
    .first()
    .click()
  await dialog.getByRole('group', { name: 'Light theme tone' }).getByRole('button', { name: 'Sage' }).click()
  await expect(html).not.toHaveAttribute('data-light-palette', /.+/)
})

test('highlights a karaoke line without word timings whole, without a sweep', async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  test.skip(!SERIAL, 'E2E_SERIAL is required against a real gateway')
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/album/Inner%20Space/Forma')
  const title = page.getByTestId('track-title')
  // The mock is shared by both projects: start the track from its beginning.
  if ((await title.count()) && (await title.textContent())?.trim() === 'Weightless') {
    await page.getByRole('button', { name: 'Play Orbit' }).click()
    await expect(title).toHaveText('Orbit', { timeout: 15_000 })
  }
  await page.getByRole('button', { name: 'Play Weightless' }).click()
  await expect(title).toHaveText('Weightless', { timeout: 15_000 })
  await page.getByRole('button', { name: 'Lyrics' }).filter({ visible: true }).first().click()
  await page.getByRole('complementary', { name: 'Player view' }).getByTestId('karaoke-open').click()
  const current = page.getByTestId('karaoke').locator('[aria-current=true]')
  await expect(current).toHaveText('Weightless, first line', { timeout: 15_000 })
  // Five seconds long, it is lit whole from its start: one part, fully sung.
  await expect(current.locator('span')).toHaveCount(1)
  await expect(current.locator('span')).toHaveAttribute('data-progress', '1.00')
  await page.keyboard.press('Escape')
  await disconnect(page)
})

test('sings along in karaoke: word timings sweep the current line and at most seven lines show', async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  test.skip(!SERIAL, 'E2E_SERIAL is required against a real gateway')
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/album/Inner%20Space/Forma')
  // The mock is shared by both projects: start the track from its beginning.
  const title = page.getByTestId('track-title')
  if ((await title.count()) && (await title.textContent())?.trim() === 'Still Here') {
    await page.getByRole('button', { name: 'Play Orbit' }).click()
    await expect(title).toHaveText('Orbit', { timeout: 15_000 })
  }
  await page.getByRole('button', { name: 'Play Still Here' }).click()
  await expect(title).toHaveText('Still Here', { timeout: 15_000 })
  await page.getByRole('button', { name: 'Lyrics' }).filter({ visible: true }).first().click()
  const panel = page.getByRole('complementary', { name: 'Player view' })
  await panel.getByTestId('karaoke-open').click()
  const karaoke = page.getByTestId('karaoke')
  await expect(karaoke).toBeVisible()
  await expect(karaoke).toContainText('Still Here')
  // The first line sweeps word by word as the position ticks.
  const current = karaoke.locator('[aria-current=true]')
  await expect(current).toHaveText('Still here, still awake', { timeout: 15_000 })
  await expect(current.locator('span')).toHaveCount(4)
  await expect(current.locator('span').first()).toHaveAttribute('data-progress', '1.00', { timeout: 10_000 })
  // Later lines take over; never more than seven lines are shown.
  await expect(current).toHaveText('Counting the lights outside', { timeout: 15_000 })
  const shown = karaoke.getByTestId('karaoke-lines').locator('p:not([aria-hidden=true])')
  expect(await shown.count()).toBeLessThanOrEqual(7)
  // A pause shows three dots that fill in turn until the next line.
  const dots = karaoke.getByTestId('karaoke-dots')
  await expect(dots).toBeVisible({ timeout: 15_000 })
  await expect(dots.locator('[data-fill="1.00"]').first()).toBeVisible({ timeout: 5_000 })
  // Escape leaves karaoke, not the listening panel under it.
  await page.keyboard.press('Escape')
  await expect(karaoke).toBeHidden()
  await expect(panel).toBeVisible()
  // K opens it again from anywhere and closes it.
  await page.keyboard.press('Escape')
  await page.keyboard.press('k')
  await expect(karaoke).toBeVisible()
  await page.keyboard.press('k')
  await expect(karaoke).toBeHidden()
  await disconnect(page)
})

test('browses the card, creates a folder and adds music into it', async ({ page }, info) => {
  test.skip(external, 'Needs the mock collection')
  test.skip(!SERIAL, 'E2E_SERIAL is required against a real gateway')
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/card/files')
  await expect(
    page.getByRole('navigation', { name: 'Card views' }).getByRole('link', { name: 'Files' }),
  ).toHaveAttribute('aria-current', 'page')
  const list = page.getByTestId('files-list')
  await list.getByRole('link', { name: 'Forma - Inner Space' }).click()
  await expect(page.getByTestId('files-path')).toContainText('Forma - Inner Space')
  // A file names its track and links its album from the library.
  const orbit = list.getByRole('listitem').filter({ hasText: '01 Orbit.flac' })
  await expect(orbit.getByRole('link', { name: 'Inner Space' })).toBeVisible()
  await page.getByTestId('files-path').getByRole('link', { name: 'Card' }).click()
  await expect(list.getByRole('link', { name: 'Forma - Inner Space' })).toBeVisible()
  // The service's .disc folder is not the owner's to browse.
  await expect(list.getByText('.disc')).toHaveCount(0)

  const name = `Test folder ${info.project.name}`
  await page.getByRole('button', { name: 'New folder' }).click()
  const field = page.getByRole('textbox', { name: 'Folder name' })
  await field.fill('bad/name')
  await expect(page.getByRole('alert')).toContainText('Use a name without')
  await field.fill(name)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Folder created and found on the card.' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByTestId('files-path')).toContainText(name)
  await expect(page.getByTestId('files-empty')).toBeVisible()
  // Adding music here chooses this folder in the import dialog.
  await page.getByTestId('files-add').click()
  await expect(page.getByTestId('import-destination')).toContainText(name)
  await page.keyboard.press('Escape')
  await disconnect(page)
})

test('plays a folder and a file from the file manager, and pauses the playing one', async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  test.skip(!SERIAL, 'E2E_SERIAL is required against a real gateway')
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/card/files')
  const list = page.getByTestId('files-list')
  const folder = list.getByRole('listitem').filter({ hasText: 'Sundial - Daybreak' })
  await folder.hover()
  await folder.getByRole('button', { name: 'Play Sundial - Daybreak' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Done. Verified on DISC.' })).toBeVisible({ timeout: 15_000 })
  // Stock plays the folder from its first audio file; the folder row is the playing one.
  await expect(page.getByTestId('track-title')).toHaveText('Daybreak')
  await expect(folder).toHaveAttribute('aria-current', 'true')
  await folder.hover()
  await folder.getByRole('button', { name: 'Pause Sundial - Daybreak' }).click()
  await expect(page.getByTestId('toggle')).toHaveAttribute('aria-label', 'Play', { timeout: 15_000 })
  // One file plays within its folder.
  await folder.getByRole('link', { name: 'Sundial - Daybreak' }).click()
  const file = list.getByRole('listitem').filter({ hasText: '03 Good Things.flac' })
  await file.hover()
  await file.getByRole('button', { name: 'Play 03 Good Things.flac' }).click()
  await expect(page.getByTestId('track-title')).toHaveText('Good Things', { timeout: 15_000 })
  await expect(file).toHaveAttribute('aria-current', 'true')
  await disconnect(page)
})

test('shows the track stock remembers when it reports nothing, and Play continues it', async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  test.skip(!SERIAL, 'E2E_SERIAL is required against a real gateway')
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/album/Night%20Drive/Northline')
  await page.getByRole('button', { name: 'Play City Glow' }).click()
  await expect(page.getByTestId('track-title')).toHaveText('City Glow', { timeout: 15_000 })
  await disconnect(page)
  // Like the queue ending or USB storage mode: stock answers no play state any more.
  await page.request.post('/__mock/silent')
  await connectAndPair(page)
  // The bar shows the remembered track paused, as the player's own screen does.
  await expect(page.getByTestId('track-title')).toHaveText('City Glow', { timeout: 15_000 })
  const toggle = page.getByTestId('toggle')
  await expect(toggle).toHaveAttribute('aria-label', 'Play')
  await toggle.click()
  await expect(page.getByTestId('toggle')).toHaveAttribute('aria-label', 'Pause', { timeout: 15_000 })
  await expect(page.getByTestId('track-title')).toHaveText('City Glow')
  await disconnect(page)
})

test('shows what takes space on the card by format, album and artist', async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  await english(page)
  // The connection dialog's card bar leads to the view.
  await openConnection(page)
  await page
    .getByRole('dialog')
    .getByRole('link', { name: /What takes space/ })
    .click()
  await expect(page).toHaveURL(/#\/card$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Card' })).toBeVisible()
  // Every library file is measured once through the media route.
  await expect(page.getByText(/^Measured (\d+) of \1 files$/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('card-usage')).toContainText('used of 64 GB')
  await expect(page.getByTestId('card-usage')).toContainText('18 GB free')
  const formats = page.getByTestId('space-formats')
  await expect(formats).toContainText('FLAC Hi-Res')
  await expect(formats).toContainText('4 files')
  // The mock's 24/96 release is the largest album and names its format.
  const first = page.getByTestId('space-albums').getByRole('listitem').first()
  await expect(first).toContainText('Blue Hours')
  await expect(first).toContainText('FLAC Hi-Res')
  await expect(page.getByTestId('space-artists').getByRole('listitem').first()).toContainText('Mira Sol')
  await expect(page.getByRole('heading', { name: /Possible duplicates/ })).toBeVisible()
  // Album rows link the album (title and cover) and its artist.
  await first.getByRole('link', { name: 'Mira Sol' }).click()
  await expect(page).toHaveURL(/#\/artist\/Mira%20Sol$/)
  await page.goBack()
  await page.getByTestId('space-albums').getByRole('listitem').first().getByRole('link', { name: 'Blue Hours' }).click()
  await expect(page).toHaveURL(/#\/album\/Blue%20Hours/)
})

test('remembers a file the media route could not measure instead of asking on every visit', async ({
  page,
  request,
}) => {
  test.skip(external, 'Needs the mock gateway')
  await request.post('/__mock/info-missing?title=Last%20Exit')
  try {
    await english(page)
    await page.goto('/#/card')
    await expect(page.getByText(/^Measured (\d+) of \d+ files · 1 file could not be read$/)).toBeVisible({
      timeout: 30_000,
    })
    const reads = async () =>
      ((await (await request.get('/__mock/info-reads?title=Last%20Exit')).json()) as { reads: number }).reads
    const before = await reads()
    expect(before).toBeGreaterThan(0)
    // A reload and another visit ask for it no more.
    await page.reload()
    await page.goto('/#/albums')
    await page.goto('/#/card')
    await expect(page.getByText(/· 1 file could not be read$/)).toBeVisible({ timeout: 30_000 })
    expect(await reads()).toBe(before)
  } finally {
    await request.post('/__mock/info-missing?title=')
  }
})

test('counts the tracks while the summary answers busy, and reads the summary again on opening', async ({
  page,
  request,
}) => {
  test.skip(external, 'Needs the mock gateway')
  test.setTimeout(90_000)
  // As while stock scans after USB storage mode: every read of the counts is busy.
  await request.post('/__mock/summary-busy?times=1000')
  try {
    await english(page)
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Albums' }).first()).toBeVisible()
    await openConnection(page)
    const tracksFact = page.getByRole('dialog').getByTestId('player-facts').locator('div').filter({ hasText: 'Tracks' })
    await expect(tracksFact).toContainText(/\d+/, { timeout: 30_000 })
    const shown = (await tracksFact.locator('dd').textContent())?.trim()
    await page.keyboard.press('Escape')
    // The counts answer again: opening the dialog reads them, and they agree with the loaded tracks.
    await request.post('/__mock/summary-busy?times=0')
    const summary = (await (await request.get('/api/data/library_summary')).json()) as { rows: number[][] }
    expect(shown).toBe(String(summary.rows[0]?.[0]))
    await openConnection(page)
    await expect(tracksFact.locator('dd')).toHaveText(String(summary.rows[0]?.[0]))
    await page.keyboard.press('Escape')
  } finally {
    await request.post('/__mock/summary-busy?times=0')
  }
})

test('reads no queue while stock has dropped its queue table, and shows none', async ({ page, request }) => {
  test.skip(!SERIAL || external, 'Needs the mock gateway and a serial number')
  await request.post('/__mock/queue-dropped?on=1')
  try {
    const errors = watchErrors(page)
    const reads: string[] = []
    page.on('request', (sent) => {
      const path = new URL(sent.url()).pathname
      if (path.startsWith('/api/data/queue')) reads.push(path)
    })
    await english(page)
    await connectAndPair(page)
    await page.getByRole('button', { name: 'Open queue' }).click()
    const panel = page.getByRole('complementary', { name: 'Player view' })
    await expect(panel).toBeVisible()
    await expect.poll(() => reads.length).toBeGreaterThan(0)
    // Only the cheap check: the queue itself, which would answer busy, is never asked for.
    expect(reads.every((path) => path === '/api/data/queue_state')).toBe(true)
    await page.keyboard.press('Escape')
    await disconnect(page)
    expect(errors).toEqual([])
  } finally {
    await request.post('/__mock/queue-dropped?on=0')
  }
})

test('keeps the reference layout on a phone without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await english(page)
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Albums' })).toBeVisible()
  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(await overflow()).toBeLessThanOrEqual(0)
  if (external) return
  // Pages with a row of actions or wide rows (album and artist headings, the Card views).
  for (const [path, heading] of [
    ['/#/album/Afterglow', 'Afterglow'],
    ['/#/artist/Northline', 'Northline'],
    ['/#/card', 'Card'],
    ['/#/card/files', 'Card'],
    ['/#/card/trash', 'Card'],
  ] as const) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    await expect(page.getByRole('main').getByRole('button').first()).toBeVisible()
    expect(await overflow(), path).toBeLessThanOrEqual(0)
  }
})
