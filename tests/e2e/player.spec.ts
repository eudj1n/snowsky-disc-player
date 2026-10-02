import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import {
  chooseSources,
  command,
  forgetRecord,
  connectAndPair,
  disconnect,
  english,
  external,
  LANGUAGES,
  openConnection,
  openSettings,
  PAIRING_FIELD,
  SERIAL,
  storeRecords,
  switchSide,
  watchErrors,
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

test('keeps an address changed while the first view still loads', async ({ page }) => {
  test.skip(external, 'Delays a chunk of the served build')
  // The first view's chunk arrives late, so the hash changes before the router's first navigation ends.
  await page.route('**/assets/HomeView-*.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_500))
    await route.continue()
  })
  await page.goto('/')
  await page.goto('/#/albums')
  await expect(page.getByRole('heading', { level: 1, name: /Albums|Альбомы/ })).toBeVisible({ timeout: 10_000 })
  expect(new URL(page.url()).hash).toBe('#/albums')
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

test('repeats the queue, then one track, then nothing, as stock keeps one play mode', async ({ page }, info) => {
  test.skip(!SERIAL, 'E2E_SERIAL is required against a real gateway')
  test.skip(info.project.name === 'phone', 'The bar keeps the repeat button for wider screens')
  await english(page)
  await connectAndPair(page)
  const bar = page.getByRole('region', { name: 'Player' })
  const queue = bar.getByRole('button', { name: 'Repeat queue' })
  await expect(queue).toHaveAttribute('aria-pressed', 'false')
  await queue.click()
  await expect(queue).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 })
  await queue.click()
  const one = bar.getByRole('button', { name: 'Repeat one' })
  await expect(one).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 })
  await one.click()
  await expect(bar.getByRole('button', { name: 'Repeat queue' })).toHaveAttribute('aria-pressed', 'false', {
    timeout: 15_000,
  })
  await disconnect(page)
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

test('plays a track from an album page and shows it in Now Playing and Queue', async ({ page }, info) => {
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
  // The queue is a sheet of its own (owner, 2026-10-02): the bar's button, on phones the full-screen player's.
  await expect(panel.getByTestId('panel-queue')).toHaveCount(0)
  const openQueue = () => page.getByRole('button', { name: 'Open queue' }).filter({ visible: true }).first().click()
  await openQueue()
  const sheet = page.getByRole('complementary', { name: 'Queue' })
  const playing = sheet.getByTestId('panel-queue').locator('[aria-current=true]')
  await expect(playing).toContainText('Window Seat')
  // Queue rows show the album's cover (their paths come from the persisted queue), not the sleeve.
  const rows = sheet.getByRole('listitem')
  await expect(rows).toHaveCount(4)
  await expect(rows.locator('[data-cover=true] canvas')).toHaveCount(4, { timeout: 15_000 })
  // The mark follows playback without reading the queue again. On phones the sheet covers the bar and
  // leads back to the full-screen player, whose controls move on.
  if (info.project.name === 'phone') {
    await sheet.getByRole('button', { name: 'Back to player' }).click()
    await panel.getByRole('button', { name: 'Next track' }).click()
    await expect(panel.getByRole('heading', { name: 'An Open Door' })).toBeVisible({ timeout: 15_000 })
    await openQueue()
  } else await page.getByRole('button', { name: 'Next track' }).filter({ visible: true }).first().click()
  await expect(playing).toContainText('An Open Door', { timeout: 15_000 })
  await expect(playing).toHaveCount(1)
  // As in the collection's rows, the playing row's cover pauses and resumes it.
  await playing.hover()
  await playing.getByRole('button', { name: 'Pause An Open Door' }).click()
  await expect(playing.getByRole('button', { name: 'Play An Open Door' })).toBeAttached({ timeout: 15_000 })
  await playing.getByRole('button', { name: 'Play An Open Door' }).click()
  await expect(playing.getByRole('button', { name: 'Pause An Open Door' })).toBeAttached({ timeout: 15_000 })
  // Escape leaves the sheet as its button does: on phones back to the player first.
  if (info.project.name === 'phone') {
    await page.keyboard.press('Escape')
    await expect(panel).toBeVisible()
  }
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(sheet).toBeHidden()
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

test('lists the main artists by default, every artist on request, and filters them by genre', async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  await english(page)
  await page.goto('/#/artists')
  const names = page.getByRole('main').getByRole('article').getByRole('heading')
  await expect(names.filter({ hasText: 'Sundial' })).toHaveCount(1)
  // A guest on one track of another's album shows under All only (owner, 2026-10-02).
  await expect(names.filter({ hasText: 'Lumi Vale' })).toHaveCount(0)
  const shown = page.getByRole('group', { name: 'Which artists' })
  await expect(shown.getByRole('button', { name: 'Main' })).toHaveAttribute('aria-pressed', 'true')
  await shown.getByRole('button', { name: 'All', exact: true }).click()
  await expect(page).toHaveURL(/[?&]all=1/)
  await expect(names.filter({ hasText: 'Lumi Vale' })).toHaveCount(1)
  // A genre keeps whom its page lists: anyone credited on its tracks, the guest too.
  await page.getByRole('combobox', { name: 'Genre' }).selectOption('Alternative')
  await expect(page).toHaveURL(/genre=Alternative/)
  await expect(names.filter({ hasText: 'Lumi Vale' })).toHaveCount(1)
  await expect(names.filter({ hasText: 'Kite Lines' })).toHaveCount(1)
  await expect(names.filter({ hasText: 'Forma' })).toHaveCount(0)
  await shown.getByRole('button', { name: 'Main' }).click()
  await expect(names.filter({ hasText: 'Lumi Vale' })).toHaveCount(0)
  await expect(names.filter({ hasText: 'Sundial' })).toHaveCount(1)
  // Both survive a reload, as the address holds them.
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Genre' })).toHaveValue('Alternative')
  await expect(names.filter({ hasText: 'Forma' })).toHaveCount(0)
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
  // The breadcrumbs lead back to the scope's artist (phones show only that step).
  await page.getByTestId('crumbs').getByRole('link', { name: 'Northline' }).filter({ visible: true }).click()
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
  // A genre tile shows two of its albums as records, round whatever the tile's shape.
  const jazz = page.getByRole('link', { name: /^Jazz\b/ })
  const round = async (records: Locator) => {
    await expect(records).toHaveCount(2)
    for (const record of await records.all()) {
      const box = await record.boundingBox()
      expect(box && Math.abs(box.width - box.height)).toBeLessThanOrEqual(1)
    }
  }
  await round(jazz.getByTestId('genre-record'))
  await jazz.click()
  await expect(page).toHaveURL(/#\/genre\/Jazz$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Jazz' })).toBeVisible()
  // Its heading's sleeve shows the same two records, not an album's placeholder.
  await round(page.getByTestId('genre-record'))
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

test('shows an observed cover in full size, never the typographic sleeve', async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  await english(page)
  await page.goto('/#/album/Inner%20Space')
  const open = page.getByTestId('cover-open')
  await expect(open).toBeVisible({ timeout: 15_000 })
  await open.click()
  const viewer = page.getByTestId('cover-viewer')
  await expect(viewer).toBeVisible()
  // The image at its own pixels, named by the album.
  await expect(viewer.getByTestId('cover-size')).toHaveText('4 × 4 px')
  await expect(viewer).toContainText('Inner Space')
  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()
  // An album without a cover shows its sleeve, which opens nothing.
  await page.goto('/#/album/Two%20Rooms')
  await expect(page.getByRole('heading', { level: 1, name: 'Two Rooms' })).toBeVisible()
  await expect(page.getByTestId('cover-open')).toHaveCount(0)
  // The playing track's cover in the listening panel too.
  await connectAndPair(page)
  await page.getByRole('button', { name: 'Open Now Playing panel' }).click()
  const panel = page.getByRole('complementary', { name: 'Player view' })
  await panel.getByTestId('now-cover-open').click({ timeout: 15_000 })
  await expect(viewer).toBeVisible()
  await expect(viewer.getByTestId('cover-size')).toHaveText('4 × 4 px')
  await viewer.getByRole('button', { name: 'Close' }).click()
  await expect(viewer).toBeHidden()
  await disconnect(page)
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
    return page.getByRole('complementary', { name: section === 'Open queue' ? 'Queue' : 'Player view' })
  }

  /**
   * The player's controls: the bottom bar on wider screens, the open panel on phones, where
   * it is a full-screen player (2026-09-29: the panel repeats no controls elsewhere).
   */
  async function controls(page: Page, info: TestInfo) {
    if (info.project.name === 'phone')
      return {
        scope: await openPanel(page, 'Open Now Playing panel'),
        volume: 'Player volume',
        favorite: /^Favorite track$/,
      }
    return {
      scope: page.getByRole('region', { name: 'Player' }),
      volume: 'DISC volume',
      favorite: /^(Favorite|Unfavorite) the current track$/,
    }
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

  test('switches the music to this browser and back, with its track and queue', async ({ page, request }) => {
    test.skip(external, 'Reads the mock player')
    const mock = async () =>
      (await (await request.get('/__mock/player')).json()) as { playing: boolean; title: string | null }
    await english(page)
    await connectAndPair(page)
    await page.goto('/#/album/Afterglow/Mira%20Sol')
    const toggle = page.getByTestId('toggle')
    if ((await toggle.getAttribute('aria-label')) !== 'Pause') {
      await page.getByRole('button', { name: 'Play album' }).click()
      await expect(toggle).toHaveAttribute('aria-label', 'Pause', { timeout: 15_000 })
    }
    const title = (await page.getByTestId('track-title').textContent())?.trim() ?? ''
    await switchSide(page, 'browser')
    // The player paused first (a guarded, confirmed toggle); the same track sounds here.
    await expect.poll(async () => (await mock()).playing).toBe(false)
    await expect(page.getByTestId('track-title')).toHaveText(title)
    await expect(toggle).toHaveAttribute('aria-label', 'Pause', { timeout: 15_000 })

    // Back: the player plays the same track from its queue.
    await switchSide(page, 'disc')
    await expect.poll(async () => (await mock()).playing, { timeout: 15_000 }).toBe(true)
    expect((await mock()).title).toBe(title)
    await expect(page.getByTestId('track-title')).toHaveText(title)
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
    const { scope, volume, favorite } = await controls(page, info)
    const value = info.project.name === 'phone' ? '70' : '60'
    await scope.getByRole('slider', { name: volume }).fill(value)
    await expect(page.getByRole('status').filter({ hasText: 'Done. Verified on DISC.' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(scope.locator('output')).toHaveText(value)
    await flips(page, scope.getByRole('button', { name: 'Shuffle' }))
    await flips(page, scope.getByRole('button', { name: favorite }))
    await disconnect(page)
  })

  test('the listening panel repeats no controls on wider screens and is a full-screen player on phones', async ({
    page,
  }, info) => {
    await english(page)
    await connectAndPair(page)
    const panel = await openPanel(page, 'Open Now Playing panel')
    const bar = page.getByRole('region', { name: 'Player' })
    // One sheet, no tabs (owner, 2026-10-02): the head, the folded facts, then the lyrics.
    await expect(panel.getByRole('button', { name: 'Now Playing', exact: true })).toHaveCount(0)
    await expect(panel.getByTestId('track-facts')).toBeVisible()
    await expect(panel.getByRole('heading', { name: 'Lyrics', exact: true })).toBeAttached()
    // The facts are folded until asked for (owner, 2026-09-30).
    const toggle = panel.getByTestId('facts-toggle')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(panel.locator('#track-facts-list')).toHaveCount(0)
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(panel.locator('#track-facts-list [data-fact]').first()).toBeVisible()
    await toggle.click()
    await expect(panel.getByTestId('panel-queue')).toHaveCount(0)
    const sheet = page.getByRole('complementary', { name: 'Queue' })
    if (info.project.name === 'phone') {
      await expect(panel.getByRole('button', { name: 'Next track' })).toBeVisible()
      await expect(panel.getByRole('slider', { name: 'Player volume' })).toBeVisible()
      await expect(bar).toBeHidden()
      const box = await panel.boundingBox()
      expect(box?.height).toBe(page.viewportSize()?.height)
      // The queue opens from the full-screen player, as a sheet that leads back to it.
      await panel.getByRole('button', { name: 'Open queue' }).click()
      await expect(sheet.getByRole('heading', { name: 'Queue' })).toBeVisible()
      await expect(sheet.getByRole('button', { name: 'Back to player' })).toBeFocused()
      await sheet.getByRole('button', { name: 'Back to player' }).click()
      await expect(panel.getByRole('heading', { name: 'Lyrics', exact: true })).toBeAttached()
    } else {
      await expect(panel.getByRole('button', { name: 'Next track' })).toBeHidden()
      await expect(panel.getByRole('slider', { name: 'Player volume' })).toBeHidden()
      await expect(panel.getByRole('button', { name: 'Open queue' })).toBeHidden()
      await expect(bar).toBeVisible()
      // The bar's queue button shows the queue's sheet; its Lyrics button the Now sheet at the lyrics.
      const queueButton = bar.getByRole('button', { name: 'Open queue' })
      await queueButton.click()
      await expect(sheet.getByRole('heading', { name: 'Queue' })).toBeVisible()
      await expect(queueButton).toHaveAttribute('aria-expanded', 'true')
      const lyricsButton = bar.getByRole('button', { name: 'Lyrics', exact: true })
      await lyricsButton.click()
      await expect(panel.getByRole('heading', { name: 'Lyrics', exact: true })).toBeInViewport()
      await expect(lyricsButton).toHaveAttribute('aria-expanded', 'true')
      await expect(queueButton).toHaveAttribute('aria-expanded', 'false')
      await expect(page.getByTestId('now-compact')).toBeVisible()
    }
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await disconnect(page)
  })

  test('a track liked in the player appears in Favorites at once', async ({ page }, info) => {
    await english(page)
    await connectAndPair(page)
    const title = ((await page.getByTestId('track-title').textContent()) ?? '').trim()
    const { scope, favorite } = await controls(page, info)
    const heart = scope.getByRole('button', { name: favorite })
    if ((await heart.getAttribute('aria-pressed')) === 'true') await flips(page, heart)
    await flips(page, heart)
    await page.keyboard.press('Escape')
    await page.goto('/#/favorites')
    await expect(page.getByRole('row').filter({ hasText: title })).not.toHaveCount(0)
    await disconnect(page)
  })

  test('the volume icon mutes and restores the earlier level', async ({ page }, info) => {
    await english(page)
    await connectAndPair(page)
    const { scope: panel, volume } = await controls(page, info)
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
    await panel.getByRole('slider', { name: volume }).fill(level)
    await expect(toast).toHaveText('Done. Verified on DISC.', { timeout: 15_000 })
    await panel.getByRole('button', { name: 'Mute' }).click()
    await expect(output).toHaveText('0', { timeout: 15_000 })
    await panel.getByRole('button', { name: 'Unmute' }).click()
    await expect(output).toHaveText(level, { timeout: 15_000 })
    await panel.getByRole('slider', { name: volume }).fill(before)
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

    // Rare actions are behind "⋯" (owner, 2026-09-30).
    await page.getByTestId('playlist-actions').click()
    await page.getByRole('menuitem', { name: 'Rename' }).click()
    await dialog.getByLabel('Playlist name').fill(`${name} R`)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { level: 1, name: `${name} R` })).toBeVisible({ timeout: 20_000 })

    await page.getByTestId('playlist-actions').click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page).toHaveURL(/#\/playlists$/, { timeout: 20_000 })
    await expect(page.getByRole('heading', { name: `${name} R`, exact: true })).toHaveCount(0)
    await disconnect(page)
  })

  test('selects a custom EQ preset and keeps an edited band on the player', async ({ page }, info) => {
    await english(page)
    await connectAndPair(page)
    const open = async () => {
      await command(page, 'Sound settings')
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

  test('shows the lyrics of the current track, synced with its position', async ({ page }, info) => {
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
    // The bar's Lyrics button opens the Now sheet at the current line, the head folded into the pinned line.
    await expect(lyrics.locator('[aria-current=true]')).toBeInViewport()
    const panel = page.getByRole('complementary', { name: 'Player view' })
    const compact = panel.getByTestId('now-compact')
    await expect(compact).toBeVisible()
    // Paused, away and back: Lyrics again opens at the current line. Phones pause from the pinned line,
    // as the full-screen player covers the bar.
    if (info.project.name === 'phone') {
      await compact.getByRole('button', { name: 'Pause', exact: true }).click()
      await expect(compact.getByRole('button', { name: 'Play', exact: true })).toBeVisible({ timeout: 15_000 })
    } else {
      await page.getByTestId('toggle').click()
      await expect(page.getByTestId('toggle')).toHaveAttribute('aria-label', 'Play', { timeout: 15_000 })
    }
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await page.getByRole('button', { name: 'Lyrics' }).filter({ visible: true }).first().click()
    await expect(page.getByTestId('lyrics').locator('[aria-current=true]')).toBeInViewport()
    // Lines are bold like karaoke, and their text starts where the heading's does.
    const line = lyrics.getByRole('button', { name: 'Weightless, first line' })
    await expect(line).toHaveCSS('font-weight', '700')
    const starts = await page.evaluate(() => {
      const range = document.createRange()
      const start = (element: Element | null) => {
        if (!element) return NaN
        range.selectNodeContents(element)
        return range.getBoundingClientRect().left
      }
      return [start(document.querySelector('#now-lyrics-title')), start(document.querySelector('[data-line="0"]'))]
    })
    expect(Math.abs((starts[0] ?? 0) - (starts[1] ?? 99))).toBeLessThan(1)
    await page.keyboard.press('Escape')
    await disconnect(page)
  })

  test('takes two colours of the cover for the heading, the Now Playing panel and karaoke', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'The same colours on phones')
    await english(page)
    await connectAndPair(page)
    await page.goto('/#/album/Inner%20Space/Forma')
    // The heading's gradient: the cover's colours fitted to each theme, set once the cover decoded,
    // from the workspace's top edge down to the heading's rule, across the whole workspace.
    const layer = page.getByTestId('album-colours')
    await expect.poll(() => layer.getAttribute('style'), { timeout: 15_000 }).toMatch(/--head-a: #[0-9a-f]{6}/)
    const lightFirst = (await layer.getAttribute('style'))?.match(/--head-a: (#[0-9a-f]{6})/)?.[1]
    await expect(layer).toHaveCSS('background-image', /linear-gradient/)
    const box = await layer.boundingBox()
    const workspace = await page.locator('#workspace').boundingBox()
    expect(box && workspace && Math.abs(box.y - workspace.y)).toBeLessThanOrEqual(1)
    expect(box && workspace && Math.abs(box.width - workspace.width)).toBeLessThanOrEqual(1)
    // The Play button keeps the theme's colour (owner: controls stay stable).
    const play = page.getByRole('button', { name: 'Play album' })
    const strong = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--strong').trim(),
    )
    expect(await play.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
      await page.evaluate((color) => {
        const probe = document.createElement('span')
        probe.style.color = color
        document.body.append(probe)
        const value = getComputedStyle(probe).color
        probe.remove()
        return value
      }, strong),
    )
    await page
      .getByRole('button', { name: /^(Play|Pause) Weightless/ })
      .first()
      .click()
    await expect(page.getByTestId('track-title')).toHaveText('Weightless', { timeout: 15_000 })
    await page.getByRole('button', { name: 'Open Now Playing panel' }).first().click()
    const panel = page.locator('#now-panel')
    await expect(panel).toHaveAttribute('data-on-cover', 'true', { timeout: 15_000 })
    // Light text on the cover's deep colours.
    await expect(panel.getByRole('heading', { name: 'Weightless' })).toHaveCSS('color', 'rgb(255, 255, 255)')
    await page.getByTestId('karaoke-open').click()
    await expect(page.getByTestId('karaoke-colours')).toBeAttached()
    await page.keyboard.press('Escape')
    expect(lightFirst).toBeTruthy()
    await page.keyboard.press('Escape')
    await disconnect(page)
  })

  test('pins a compact line of the track once the head scrolls away', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'The phone panel shows the same Now sheet')
    await english(page)
    await connectAndPair(page)
    // A short window, so that even short lyrics leave the head room to scroll away.
    await page.setViewportSize({ width: 1280, height: 600 })
    const compact = page.getByTestId('now-compact')
    await page.getByRole('button', { name: 'Open Now Playing panel' }).click()
    const panel = page.getByRole('complementary', { name: 'Player view' })
    await expect(panel.getByRole('heading', { level: 2 })).toBeVisible()
    await expect(compact).toBeHidden()
    // Scrolled like a reader would, down to the lyrics.
    await panel.getByTestId('track-facts').hover()
    await page.mouse.wheel(0, 2000)
    await expect(compact).toBeVisible()
    await expect(compact).toHaveCSS('opacity', '1')
    // Pinned to the top of the sheet's scroll, over the lyrics.
    const scroller = panel.getByTestId('now-lyrics').locator('xpath=ancestor::div[contains(@class,"overflow-auto")][1]')
    const line = await compact.boundingBox()
    const top = await scroller.boundingBox()
    expect(line && top && Math.abs(line.y - top.y)).toBeLessThanOrEqual(1)
    await compact.getByRole('button', { name: 'Back to the track' }).click()
    await expect(compact).toBeHidden()
    // Back at the head: the sheet is scrolled to its top again.
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(0)
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
    // The first links are the track's credit; the facts may name the album artist again.
    for (const name of ['Kite Lines', 'Mira Sol'])
      await expect(panel.getByRole('link', { name, exact: true }).first()).toBeVisible()
    await panel.getByTestId('facts-toggle').click()
    await expect(panel.getByTestId('track-facts').locator('[data-fact=album-artist]')).toHaveText('Kite Lines')
    await expect(panel).not.toContainText('Kite Lines; Mira Sol')
    // The lyrics below the head repeat neither the track nor its credit.
    await expect(panel.getByTestId('now-lyrics').getByRole('link')).toHaveCount(0)
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

  test('a paused seek waits and confirms after playback resumes', async ({ page }, info) => {
    await english(page)
    await connectAndPair(page)
    const { scope } = await controls(page, info)
    const pause = scope.getByRole('button', { name: 'Pause', exact: true })
    if (await pause.isVisible()) {
      await pause.click()
      await expect(scope.getByRole('button', { name: 'Play', exact: true })).toBeVisible({ timeout: 15_000 })
    }
    const slider = scope.getByRole('slider', { name: 'Seek position' })
    await slider.dispatchEvent('pointerdown')
    await slider.fill('90')
    await expect(page.getByRole('status').filter({ hasText: 'Seek to 1:30 sent' }).first()).toBeAttached({
      timeout: 15_000,
    })
    await scope.getByRole('button', { name: 'Play', exact: true }).click()
    // Confirmed once playback resumes: a toast says so (the bar has no line for it).
    await expect(page.getByRole('status').filter({ hasText: 'Position confirmed' }).first()).toBeAttached({
      timeout: 15_000,
    })
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
    // Beside the volume in the player bar; on phones from the full-screen player.
    if (info.project.name === 'phone') {
      await page.getByRole('region', { name: 'Player' }).getByRole('button', { name: 'Open Now Playing panel' }).click()
      await page.getByTestId('sound-open-panel').click()
    } else await page.getByTestId('sound-open').click()
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
    // Add music lives on the Card page (and in the palette).
    await page.goto('/#/card')
    await page.getByTestId('card-add-music').click()
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

  test('keeps a long selection inside its own list, not stretching the dialog', async ({ page }) => {
    await english(page)
    await page.goto('/#/card')
    await page.getByTestId('card-add-music').click()
    const dialog = page.getByRole('dialog')
    const files = Array.from({ length: 150 }, (_, n) => ({
      name: `Long ${String(n).padStart(3, '0')}.flac`,
      mimeType: 'audio/flac',
      buffer: Buffer.from('fLaC'),
    }))
    await dialog.locator('input[type=file]:not([webkitdirectory])').setInputFiles(files)
    await expect(dialog.getByTestId('import-files').getByRole('listitem')).toHaveCount(150)
    // Each row's hidden status label is absolutely placed: the list holds them (owner, 2026-10-01: the
    // dialog grew by the whole list's height and scrolled into empty space).
    const overflow = await dialog.evaluate((element) => element.scrollHeight - element.clientHeight)
    expect(overflow).toBeLessThan(700)
    await page.keyboard.press('Escape')
  })

  test('resumes a stopped transfer as a whole and connects from the dialog, keeping the list', async ({
    page,
  }, info) => {
    await english(page)
    await connectAndPair(page)
    const tag = `${info.project.name} ${Date.now()}`
    const file = (name: string) => ({ name: `${name} ${tag}.flac`, mimeType: 'audio/flac', buffer: Buffer.from(name) })
    await command(page, 'Add music')
    const dialog = page.getByRole('dialog')
    await dialog
      .locator('input[type=file]:not([webkitdirectory])')
      .setInputFiles([file('A Busy Once'), file('B After')])
    await dialog.getByRole('button', { name: 'Transfer to DISC' }).click()
    // The card was busy for the first file: the batch stopped and resumes as a whole (owner, 2026-10-01).
    const resume = dialog.getByTestId('import-resume')
    await expect(resume).toHaveText('Retry and continue (1)', { timeout: 20_000 })
    // The working strip over the player stays for the whole transfer instead of blinking between files.
    await expect(page.getByTestId('player-working')).toHaveCount(0)
    await page.evaluate(() => {
      const seen = { count: 0 }
      ;(window as unknown as { strips: typeof seen }).strips = seen
      new MutationObserver((records) => {
        for (const record of records)
          for (const node of record.addedNodes)
            if (node instanceof HTMLElement && node.dataset.testid === 'player-working') seen.count++
      }).observe(document.body, { childList: true, subtree: true })
    })
    await resume.click()
    await expect(dialog.getByTestId('import-flow')).toHaveText(/confirmed files are on the card/, { timeout: 20_000 })
    await expect(resume).toHaveCount(0)
    await expect(page.getByTestId('player-working')).toHaveCount(0)
    expect(await page.evaluate(() => (window as unknown as { strips: { count: number } }).strips.count)).toBe(1)
    // Disconnected, the dialog keeps its list and connects in place with the kept serial number.
    await page.keyboard.press('Escape')
    await disconnect(page)
    await command(page, 'Add music')
    await expect(dialog.getByTestId('import-files')).toContainText(`B After ${tag}`)
    await expect(dialog.getByTestId('import-connect')).toHaveText('Connect DISC →')
    await dialog.getByTestId('import-connect').click()
    await expect(dialog.getByTestId('import-connect')).toHaveCount(0, { timeout: 15_000 })
    await page.keyboard.press('Escape')
    // Without a kept serial number, pairing opens the connection dialog, which brings adding music back.
    await disconnect(page)
    await openConnection(page)
    await page.getByRole('dialog').getByRole('button', { name: 'Forget serial number' }).click()
    await page.keyboard.press('Escape')
    await command(page, 'Add music')
    await dialog.getByTestId('import-connect').click()
    await expect(dialog.getByLabel(PAIRING_FIELD)).toBeVisible()
    await dialog.getByLabel(PAIRING_FIELD).fill(SERIAL ?? '')
    await dialog.getByRole('button', { name: 'Pair' }).click()
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click()
    await expect(dialog.getByTestId('connection-state')).toContainText('Connected')
    await page.keyboard.press('Escape')
    await expect(dialog.getByTestId('import-files')).toContainText(`B After ${tag}`)
    await expect(dialog.getByTestId('import-connect')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await disconnect(page)
  })

  test('skips files already on the card and lets the list be trimmed', async ({ page }, info) => {
    await english(page)
    await connectAndPair(page)
    const tag = `${info.project.name} ${Date.now()}`
    const file = (name: string) => ({ name: `${name} ${tag}.flac`, mimeType: 'audio/flac', buffer: Buffer.from(name) })
    await command(page, 'Add music')
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
    await command(page, 'Add music')
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
    await command(page, 'Add music')
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
  // Each artist's picture as on the Artists page: without a photo, the cover of an album of theirs stands in.
  await expect(members.getByRole('listitem').filter({ hasText: 'Mira Sol' }).locator('canvas')).toBeVisible({
    timeout: 15_000,
  })
  await members.getByRole('link', { name: 'Mira Sol' }).first().click()
  await expect(page).toHaveURL(/#\/artist\/Mira%20Sol$/)
  await page.goBack()
  // The breadcrumbs name the pair and open their page.
  await page
    .getByTestId('crumbs')
    .getByRole('link', { name: /Kite Lines & Mira Sol/ })
    .filter({ visible: true })
    .click()
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

test("keeps every control of the phone's mini player on the screen", async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'The mini player is the phone layout')
  test.skip(external, 'Needs the mock collection')
  await english(page)
  await connectAndPair(page)
  const bar = page.getByRole('region', { name: 'Player' })
  await expect(bar.getByRole('button', { name: 'Open queue' })).toBeVisible()
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 800 })
    const boxes: { name: string | null; x: number; y: number; width: number; height: number }[] = []
    for (const button of await bar.getByRole('button').all()) {
      const box = await button.boundingBox()
      if (box && box.width > 0) boxes.push({ name: await button.getAttribute('aria-label'), ...box })
    }
    boxes.sort((a, b) => a.x - b.x)
    for (const box of boxes) {
      expect(box.x, `${box.name} at ${width}`).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, `${box.name} at ${width}`).toBeLessThanOrEqual(width)
    }
    // Neighbours on one line do not overlap.
    for (const [left, right] of boxes.slice(1).map((box, index) => [boxes[index], box] as const))
      if (Math.abs(right.y - left.y) < left.height)
        expect(left.x + left.width, `${left.name} and ${right.name} at ${width}`).toBeLessThanOrEqual(right.x)
  }
})

test("follows the system's contrast and transparency settings", async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'One browser is enough for media features')
  test.skip(external, 'Needs the mock collection')
  await english(page)
  await connectAndPair(page)
  const note = page.getByText(/^In this section/)
  const bar = page.getByRole('region', { name: 'Player' })
  await page.goto('/#/tracks')
  await expect(note).toBeVisible()
  const color = () => note.evaluate((element) => getComputedStyle(element).color)
  const usual = await color()
  await expect(bar).toHaveCSS('backdrop-filter', /blur/)

  // More contrast pulls secondary text toward the ink.
  await page.emulateMedia({ contrast: 'more' })
  await expect.poll(color).not.toBe(usual)
  await page.emulateMedia({ contrast: null })
  await expect.poll(color).toBe(usual)

  // Less transparency: a solid player bar without blur.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
  })
  await expect(bar).toHaveCSS('backdrop-filter', 'none')
  const paper = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)
  await expect(bar).toHaveCSS('background-color', paper)
})

test('gives Japanese and Korean names their language and isolates every inline name', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'The document is the same on phones')
  await english(page)
  await page.goto('/#/tracks')
  await expect(page.getByRole('table').getByRole('row').nth(1)).toBeVisible()
  const name = page.getByTestId('script-probe')
  await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.dataset.testid = 'script-probe'
    probe.textContent = '宇多田ヒカル'
    document.querySelector('main')?.append(probe)
  })
  await expect(name).toHaveAttribute('lang', 'ja')
  await expect(name).toHaveCSS('unicode-bidi', 'isolate')
  await name.evaluate((element) => (element.textContent = 'Lumen'))
  await expect(name).not.toHaveAttribute('lang')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

test('draws select arrows inside the rounded edge', async ({ page }) => {
  await english(page)
  await page.goto('/#/tracks')
  for (const select of [page.getByRole('combobox', { name: 'Genre' })]) {
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
  // The toggle sits where the sidebar's edge meets the top bar's bottom line.
  const toggle = await page.getByRole('button', { name: 'Collapse sidebar' }).boundingBox()
  const banner = await page.getByRole('banner').boundingBox()
  const edge = await sidebar.boundingBox()
  expect(toggle && banner && Math.abs(toggle.y + toggle.height / 2 - (banner.y + banner.height))).toBeLessThanOrEqual(1)
  expect(toggle && edge && Math.abs(toggle.x + toggle.width / 2 - (edge.x + edge.width))).toBeLessThanOrEqual(1)
  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  await expect.poll(width).toBe(74)
  // The rail's icons start below the toggle, under the top bar's line.
  const expand = await page.getByRole('button', { name: 'Expand sidebar' }).boundingBox()
  const home = await sidebar.getByRole('link', { name: 'Home', exact: true }).boundingBox()
  expect(expand && home && home.y - (expand.y + expand.height)).toBeGreaterThanOrEqual(8)
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
  // The bar goes on in the album's top colour, see-through (2026-09-30); the layer blends in over 0.7 s.
  const topOf = (locator: Locator) =>
    locator.evaluate((element) => getComputedStyle(element).getPropertyValue('--head-a'))
  await expect(bar).toHaveCSS('background-color', /^(rgba|oklab|color)\(/)
  await expect.poll(async () => (await topOf(bar)) === (await topOf(page.getByTestId('album-colours')))).toBe(true)
  await expect(bar.getByRole('link', { name: 'Northline' })).toBeVisible()
  // Not connected: nothing plays from here yet, but the button is there.
  await expect(bar.getByRole('button', { name: 'Play album' })).toBeVisible()
  // The name returns to the top, where the full header takes over again.
  await bar.getByRole('button', { name: 'Afterglow' }).click()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await expect(bar).toHaveCount(0)
})

test('opens a track from its title in the panel, plays it from there or with a double click', async ({
  page,
}, info) => {
  test.skip(external, 'Needs the mock collection')
  test.skip(info.project.name === 'phone', 'On phones the panel covers the rows (the close button leads back)')
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/album/Afterglow/Northline')
  const title = (name: string) =>
    page.getByRole('row').filter({ hasText: name }).getByRole('button', { name, exact: true })
  await title('Soft Focus').click()
  const panel = page.getByTestId('track-panel')
  await expect(panel.getByTestId('track-panel-title')).toHaveText('Soft Focus')
  await expect(panel.getByRole('link', { name: 'Northline' })).toBeVisible()
  await expect(panel.getByTestId('track-panel-lyrics')).toContainText(/Lyrics/)
  // The same title again closes it; another switches to its track.
  await title('Soft Focus').click()
  await expect(panel).toHaveCount(0)
  await title('Soft Focus').click()
  await title('First Light').click()
  await expect(panel.getByTestId('track-panel-title')).toHaveText('First Light')
  await panel.getByTestId('track-panel-play').click()
  const bar = page.getByRole('region', { name: 'Player' })
  await expect(bar.getByTestId('track-title')).toHaveText('First Light', { timeout: 15_000 })
  // Now it plays, the panel's button pauses it.
  await expect(panel.getByTestId('track-panel-play')).toHaveText(/Pause/)
  // A sheet of its own (owner, 2026-10-02): no player tabs, a close button.
  const sheet = page.getByRole('complementary', { name: 'Details' })
  await expect(sheet.getByRole('button', { name: 'Now Playing' })).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(panel).toHaveCount(0)
  // A double click on a row plays it, as its number does.
  await page.getByRole('row').filter({ hasText: 'Somewhere, Slowly' }).getByRole('cell').nth(-2).dblclick()
  await expect(bar.getByTestId('track-title')).toHaveText('Somewhere, Slowly', { timeout: 15_000 })
  await disconnect(page)
})

test('searches the whole collection from the palette, with commands and the full page', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Phones open the search page (below)')
  test.skip(external, 'Needs the mock collection')
  const errors = watchErrors(page)
  await english(page)
  await page.goto('/#/albums')
  // The view has rendered first: a "/" pressed while the route still settled was lost in 2 of 8 runs.
  await expect(page.getByRole('heading', { name: 'Albums', level: 1 })).toBeVisible()
  await page.keyboard.press('/')
  const palette = page.getByTestId('search-palette')
  const field = palette.getByRole('combobox', { name: 'Search your collection' })
  await expect(field).toBeFocused()
  // Nothing typed: the commands.
  await expect(palette.getByRole('option', { name: 'Go to Tracks', exact: true })).toBeVisible()
  // Case and diacritics do not matter; an equal name is the top result.
  await field.fill('NÓRTHLINE')
  const groups = palette.getByRole('group')
  await expect(groups.first()).toHaveAttribute('aria-labelledby', 'palette-group-top')
  await expect(groups.first().getByRole('option')).toHaveText(/Northline\s*Artist/)
  // Opened from Albums: albums come before the other kinds.
  await expect(groups.nth(1)).toHaveAttribute('aria-labelledby', 'palette-group-albums')
  await field.fill('afterglow')
  await expect(palette.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
  await field.press('Enter')
  await expect(palette).toBeHidden()
  await expect(page).toHaveURL(/#\/album\/Afterglow/)
  // Breadcrumbs replace the back link: the section, the scope, the album.
  const crumbs = page.getByTestId('crumbs')
  await expect(crumbs.getByRole('link', { name: 'Albums', exact: true })).toBeVisible()
  await expect(crumbs.locator('[aria-current=page]')).toHaveText('Afterglow')
  // The crumbs start where the content does, at every width (owner, 2026-09-30).
  for (const width of [1600, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    const crumb = await crumbs.getByRole('link', { name: 'Albums', exact: true }).boundingBox()
    const heading = await page
      .getByRole('heading', { level: 1 })
      .locator('xpath=ancestor::div[contains(@class,"isolate")][1]')
      .boundingBox()
    expect(crumb?.x, `width ${String(width)}`).toBe(heading?.x)
  }
  // ⌘K (Ctrl+K): arrows move, the modifier with Enter opens the search page.
  await page.keyboard.press('ControlOrMeta+k')
  await field.fill('light')
  await field.press('ArrowDown')
  await expect(palette.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true')
  await field.press('ControlOrMeta+Enter')
  await expect(page).toHaveURL(/#\/search\?q=light&from=albums$/)
  // A tie between a word of an album and of a track goes to the section it was opened from.
  await expect(page.getByTestId('search-top')).toContainText('Shared Light')
  await expect(page.getByTestId('search-tracks').getByRole('row').nth(1)).toBeVisible()
  await page.getByTestId('search-field').fill('zzzz')
  await expect(page).toHaveURL(/q=zzzz/)
  await expect(page.getByRole('heading', { name: 'Nothing found for “zzzz”' })).toBeVisible()
  // A command: the theme.
  await page.keyboard.press('ControlOrMeta+k')
  await field.fill('dark theme')
  await field.press('Enter')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await command(page, 'Light theme')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(errors).toEqual([])
})

test("opens the search page from the phone's top bar", async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'The phone layout')
  test.skip(external, 'Needs the mock collection')
  await english(page)
  // A section's own page shows the logo where the sidebar's would be.
  await expect(page.getByTestId('topbar-logo')).toBeVisible()
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page).toHaveURL(/#\/search$/)
  const field = page.getByTestId('search-field')
  await expect(field).toBeFocused()
  await field.fill('mira')
  await expect(page.getByTestId('search-top')).toContainText('Mira Sol')
  await page.getByTestId('search-top').getByRole('link', { name: 'Mira Sol' }).click()
  await expect(page).toHaveURL(/#\/artist\/Mira%20Sol$/)
  // Phones show the step back as the way back.
  await page.getByTestId('crumbs').getByRole('link', { name: 'Artists' }).filter({ visible: true }).click()
  await expect(page).toHaveURL(/#\/artists$/)
})

test('reads the collection again from the connection dialog', async ({ page }) => {
  test.skip(external, 'Needs the mock gateway')
  await english(page)
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Albums' }).first()).toBeVisible()
  await openConnection(page)
  const read = page.waitForRequest((request) => request.url().includes('/api/data/'))
  await page.getByRole('dialog').getByTestId('refresh-collection').click()
  await read
})

test('keeps the interface language in Settings, with the theme and the text size', async ({ page }) => {
  await english(page)
  await openSettings(page)
  const settings = page.getByTestId('settings-appearance')
  const languages = settings.getByRole('group', { name: 'Interface language' })
  await expect(languages.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true')
  await languages.getByRole('button', { name: 'Русский' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
  await expect(settings.getByRole('group', { name: 'Язык интерфейса' })).toBeVisible()
  // A page of its own under Your player in the sidebar (owner, 2026-10-01).
  await expect(page.getByRole('heading', { level: 1, name: 'Настройки' })).toBeVisible()
  await settings.getByRole('button', { name: 'English' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

test('offers the tones of the theme in effect and keeps the chosen palettes', async ({ page }) => {
  await english(page)
  const html = page.locator('html')
  await openSettings(page)
  const dialog = page.getByTestId('settings-appearance')
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
  await openSettings(page)
  await dialog.getByRole('group', { name: 'Light theme tone' }).getByRole('button', { name: 'Sage' }).click()
  await expect(html).not.toHaveAttribute('data-light-palette', /.+/)
})

test('changes the text size and keeps it before the first paint', async ({ page }) => {
  await english(page)
  const html = page.locator('html')
  await page.goto('/#/tracks')
  const title = page.getByRole('table').getByRole('row').nth(1).locator('[data-track-open]')
  await expect(title).toHaveCSS('font-size', '14px')
  const openAppearance = () => openSettings(page)
  await openAppearance()
  const sizes = page.getByTestId('settings-appearance').getByRole('group', { name: 'Text size' })
  await expect(sizes.getByRole('button')).toHaveCount(4)
  await expect(sizes.getByRole('button', { name: 'Standard', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await sizes.getByRole('button', { name: 'Large', exact: true }).click()
  await expect(html).toHaveAttribute('data-text-size', 'large')
  await page.goBack()
  await expect(title).toHaveCSS('font-size', '16px')
  await page.reload()
  // Applied before paint by theme.js, then kept by the store.
  await expect(html).toHaveAttribute('data-text-size', 'large')
  await expect(title).toHaveCSS('font-size', '16px')
  await openAppearance()
  await sizes.getByRole('button', { name: 'Standard', exact: true }).click()
  await expect(html).not.toHaveAttribute('data-text-size', /.+/)
  expect(await page.evaluate(() => localStorage.getItem('disc-player.text-size'))).toBeNull()
})

test('finds lyrics on LRCLIB for a track without any and saves them beside it', async ({ page }, info) => {
  test.skip(external, 'Needs the mock collection')
  test.skip(!SERIAL, 'E2E_SERIAL is required against a real gateway')
  // The saved file stays in the shared mock: once, on desktop.
  test.skip(info.project.name === 'phone', 'Runs once: the saved lyrics stay in the shared mock')
  const asked: URL[] = []
  await page.route('https://lrclib.net/api/**', async (route) => {
    const url = new URL(route.request().url())
    asked.push(url)
    const headers = { 'Access-Control-Allow-Origin': '*' }
    if (url.pathname !== '/api/get') return route.fulfill({ status: 404, headers, json: { code: 404 } })
    await route.fulfill({
      headers,
      json: {
        syncedLyrics: '[00:00.00]Orbit, a line found online\n[00:06.00]Orbit, the next one',
        plainLyrics: 'Orbit, a line found online\nOrbit, the next one',
        instrumental: false,
        duration: 200,
      },
    })
  })
  await chooseSources(page)
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/album/Inner%20Space/Forma')
  const title = page.getByTestId('track-title')
  if ((await title.count()) && (await title.textContent())?.trim() === 'Orbit') {
    await page.getByRole('button', { name: 'Play Weightless' }).click()
    await expect(title).toHaveText('Weightless', { timeout: 15_000 })
  }
  await page.getByRole('button', { name: 'Play Orbit' }).click()
  await expect(title).toHaveText('Orbit', { timeout: 15_000 })
  await page.getByRole('button', { name: 'Lyrics' }).filter({ visible: true }).first().click()
  const panel = page.getByRole('complementary', { name: 'Player view' })
  // The track has no lyrics of its own (stock's text is awaited for a few seconds), but LRCLIB stays
  // off until the owner allows it (2026-10-01): the panel says where, and nothing leaves the network.
  const off = panel.getByTestId('lyrics-source-off')
  await expect(off).toBeVisible({ timeout: 20_000 })
  await off.getByRole('link', { name: 'External sources' }).click()
  await expect(page).toHaveURL(/#\/settings\?part=sources/)
  const auto = page.getByTestId('source-lrclib-auto')
  await expect(auto).toBeDisabled()
  await page.getByTestId('source-lrclib-allow').check()
  await expect(auto).toBeEnabled()
  await expect(auto).not.toBeChecked()
  await page.goBack()
  // Offered once allowed; asked only on request, the automatic lookup being off.
  await expect(panel.getByTestId('lyrics-find')).toBeVisible({ timeout: 15_000 })
  expect(asked).toHaveLength(0)
  await panel.getByTestId('lyrics-find').click()
  const lyrics = page.getByTestId('lyrics')
  await expect(lyrics).toContainText('Orbit, a line found online')
  await expect(lyrics).toContainText('From LRCLIB, not on the card yet')
  expect(Object.fromEntries(asked[0]?.searchParams ?? [])).toMatchObject({
    artist_name: 'Forma',
    track_name: 'Orbit',
    album_name: 'Inner Space',
  })
  await panel.getByTestId('lyrics-save').click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved beside the track as its .lrc file.' })).toBeAttached({
    timeout: 15_000,
  })
  await expect(lyrics).toContainText('From the .lrc file beside the track')
  // Read back from the card after a reload: the media route serves the saved file.
  await page.reload()
  await page.getByRole('button', { name: 'Lyrics' }).filter({ visible: true }).first().click()
  await expect(page.getByTestId('lyrics')).toContainText('Orbit, a line found online', { timeout: 15_000 })
  await expect(page.getByTestId('lyrics')).toContainText('From the .lrc file beside the track')
  await expect(page.getByTestId('lyrics-find')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await disconnect(page)
  await chooseSources(page)
})

test('offers synced lyrics from LRCLIB beside plain ones in the tags, and a saved .lrc wins', async ({
  page,
}, info) => {
  test.skip(external, 'Needs the mock collection')
  test.skip(!SERIAL, 'E2E_SERIAL is required against a real gateway')
  test.skip(info.project.name === 'phone', 'Runs once: the saved lyrics stay in the shared mock')
  await page.route('https://lrclib.net/api/**', (route) =>
    route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      json: {
        syncedLyrics: '[00:00.00]Blue hours, a synced line\n[00:05.00]Blue hours, the next one',
        plainLyrics: 'Blue hours, a synced line\nBlue hours, the next one',
        instrumental: false,
        duration: 224,
      },
    }),
  )
  await chooseSources(page, { lrclib: { allowed: true } })
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/album/Blue%20Hours/Mira%20Sol')
  const title = page.getByTestId('track-title')
  if ((await title.count()) && (await title.textContent())?.trim() === 'Blue Hours') {
    await page.getByRole('button', { name: 'Play Almost Sunday' }).click()
    await expect(title).toHaveText('Almost Sunday', { timeout: 15_000 })
  }
  await page.getByRole('button', { name: 'Play Blue Hours' }).first().click()
  await expect(title).toHaveText('Blue Hours', { timeout: 15_000 })
  await page.getByRole('button', { name: 'Lyrics' }).filter({ visible: true }).first().click()
  const lyrics = page.getByTestId('lyrics')
  // The tags hold plain text: it shows, and synced lyrics are still offered.
  await expect(lyrics).toContainText('Blue hours, plain line one', { timeout: 15_000 })
  const find = page.getByTestId('lyrics-find')
  await expect(find).toHaveText('These lyrics have no timings: find synced ones on LRCLIB')
  await find.click()
  await expect(lyrics).toContainText('Blue hours, a synced line')
  await expect(lyrics).toContainText('From LRCLIB, not on the card yet')
  await page.getByTestId('lyrics-save').click()
  await expect(lyrics).toContainText('From the .lrc file beside the track', { timeout: 15_000 })
  // After a reload the card's .lrc comes before the tags.
  await page.reload()
  await page.getByRole('button', { name: 'Lyrics' }).filter({ visible: true }).first().click()
  await expect(page.getByTestId('lyrics')).toContainText('Blue hours, a synced line', { timeout: 15_000 })
  await expect(page.getByTestId('lyrics-find')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await disconnect(page)
  await chooseSources(page)
})

test('chooses a cover among the editions and fanart.tv, keeps the edition and saves the cover into its folder', async ({
  page,
}, info) => {
  test.skip(external, 'Needs the mock collection')
  test.skip(!SERIAL, 'E2E_SERIAL is required against a real gateway')
  test.skip(info.project.name === 'phone', 'Runs once: the saved cover stays in the shared mock')
  const FIRST = '7a1d2c3b-0000-4000-8000-00000000b001'
  const VINYL = '7a1d2c3b-0000-4000-8000-00000000b002'
  const BARE = '7a1d2c3b-0000-4000-8000-00000000b003'
  const GROUP = '7a1d2c3b-0000-4000-8000-00000000c001'
  const ARTIST = '7a1d2c3b-0000-4000-8000-00000000a001'
  const asked: URL[] = []
  const cors = { 'Access-Control-Allow-Origin': '*' }
  const edition = (id: string, score: number, date: string, country: string, format: string, tracks = 3) => ({
    id,
    score,
    title: 'Night Drive',
    date,
    country,
    'track-count': tracks,
    media: [{ format }],
    'label-info': [{ 'catalog-number': 'NL-001', label: { name: 'Lumen Records' } }],
    'artist-credit': [{ name: 'Northline', artist: { id: ARTIST } }],
    'release-group': { id: GROUP, 'primary-type': 'Album' },
  })
  await page.route('https://musicbrainz.org/ws/2/**', async (route) => {
    const url = new URL(route.request().url())
    asked.push(url)
    await route.fulfill({
      headers: cors,
      json: url.pathname.startsWith('/ws/2/release-group/')
        ? { id: GROUP, 'first-release-date': '2003-11-02', 'primary-type': 'Album', 'secondary-types': [] }
        : {
            releases: [
              edition(FIRST, 100, '2004-06-01', 'GB', 'CD'),
              edition(VINYL, 95, '2010-02-01', 'JP', 'Vinyl', 4),
              edition(BARE, 92, '2012', 'US', 'Digital Media'),
            ],
          },
    })
  })
  await page.route('https://webservice.fanart.tv/**', (route) =>
    route.fulfill({
      headers: cors,
      json: {
        albums: {
          [GROUP]: { albumcover: [{ id: '9', url: 'https://assets.fanart.tv/fanart/night.jpg', likes: '1' }] },
        },
      },
    }),
  )
  await page.route('https://assets.fanart.tv/**', (route) =>
    route.fulfill({ headers: cors, contentType: 'image/png', path: 'tests/e2e/fixtures/cover.png' }),
  )
  // First archive.org does not answer, as on some networks.
  await page.route('https://coverartarchive.org/**', (route) => route.abort('timedout'))
  await chooseSources(page, {
    musicbrainz: { allowed: true },
    coverartarchive: { allowed: true },
    fanarttv: { allowed: true, key: 'personal-test-key' },
  })
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/album/Night%20Drive/Northline')
  // The details (i), always in the heading (owner, 2026-10-01), lead to the cover.
  await page.getByTestId('info-open').click()
  const panel = page.getByTestId('info-panel')
  const fact = (key: string) => panel.locator(`[data-fact="${key}"]`)
  await expect(fact('cover')).toHaveText('The album has no cover yet', { timeout: 15_000 })
  const find = panel.getByTestId('info-cover-choose')
  await find.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByTestId('covers-fanarttv').getByRole('button')).toHaveCount(1, { timeout: 15_000 })
  await expect(dialog.getByTestId('covers-coverartarchive')).toHaveCount(0, { timeout: 15_000 })
  expect(asked[0]?.searchParams.get('query')).toBe('release:"Night Drive" AND artist:"Northline"')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await page.unroute('https://coverartarchive.org/**')
  // An edition without a cover of its own is not offered.
  await page.route('https://coverartarchive.org/**', (route) =>
    route.request().url().includes(BARE)
      ? route.fulfill({ status: 404, headers: cors, body: '' })
      : route.fulfill({ headers: cors, contentType: 'image/png', path: 'tests/e2e/fixtures/cover.png' }),
  )
  await find.click()
  const editions = dialog.getByTestId('covers-coverartarchive').getByRole('button')
  await expect(editions).toHaveCount(2, { timeout: 15_000 })
  // Each edition names its track count, marked where the album on the card has as many (owner, 2026-10-02).
  await expect(editions.first()).toHaveAccessibleName(
    'Cover Art Archive, 2004 · United Kingdom, CD · Lumen Records, 3 tracks, as many as the album on the card',
  )
  await expect(editions.first().getByTestId('cover-tracks')).toHaveAttribute('data-match', 'true')
  await expect(editions.last()).toHaveAccessibleName('Cover Art Archive, 2010 · Japan, Vinyl · Lumen Records, 4 tracks')
  await editions.first().click()
  await dialog.getByTestId('cover-use').click()
  const offer = page.getByTestId('cover-offer')
  await expect(offer).toContainText('Cover Art Archive: Night Drive · Northline · 2004. Not on the card yet.', {
    timeout: 15_000,
  })
  // The chosen edition is the album's MusicBrainz identity, kept on the player, with its release group's facts.
  await expect(fact('label')).toHaveText('Lumen Records NL-001')
  await expect(fact('issue')).toHaveText('2004 · United Kingdom · CD')
  await expect(fact('first')).toHaveText('2003 · Album')
  await expect(fact('musicbrainz')).toContainText('Confirmed and kept on the player')
  // The editions window names each edition's track count too; the card's count ranks its editions first.
  await fact('musicbrainz').getByTestId('fact-identify').click()
  const choices = page.getByTestId('identify-choices').getByRole('button')
  await expect(choices).toHaveCount(3, { timeout: 15_000 })
  await expect(choices.first()).toContainText('3 tracks')
  await expect(choices.first().getByTestId('edition-tracks')).toHaveAttribute('data-match', 'true')
  await expect(choices.last()).toContainText('Vinyl · 2010 · 4 tracks')
  await expect(choices.last().getByTestId('edition-tracks')).not.toHaveAttribute('data-match', 'true')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  const albums = (await storeRecords(page, 'musicbrainz')).filter((record) => record.value.kind === 'album')
  expect(albums.map((record) => [record.value.mbid, record.value.group])).toEqual([[FIRST, GROUP]])
  await page.getByTestId('cover-save').click()
  await expect(
    page.getByRole('status').filter({ hasText: "Saved into the album's folder as its cover." }).first(),
  ).toBeAttached({ timeout: 15_000 })
  // Read back from the card: the album now has a folder cover of its own.
  await expect(offer).toBeHidden()
  await expect(fact('cover')).toHaveText(/^On the card: cover\.png in the album.s folder$/, { timeout: 15_000 })
  // Another cover replaces it under its own name; the old one goes to the card's trash (owner, 2026-10-01).
  await expect(find).toHaveText('Change cover')
  await find.click()
  await dialog.getByTestId('covers-fanarttv').getByRole('button').first().click({ timeout: 15_000 })
  await dialog.getByTestId('cover-use').click()
  await expect(offer).toContainText('fanart.tv, CC BY 3.0: Night Drive · Northline · 2004. Not on the card yet.', {
    timeout: 15_000,
  })
  await expect(offer).toContainText("The old cover goes to the card's trash, where it can be restored.")
  await page.getByTestId('cover-save').filter({ hasText: 'Replace on the card' }).click()
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: "Replaced the album's cover; the old one is in the card's trash." })
      .first(),
  ).toBeAttached({ timeout: 15_000 })
  const trash = (await (await page.request.get('/api/trash')).json()) as { entries: { path: string }[] }
  expect(trash.entries.some((entry) => entry.path.endsWith('/cover.png'))).toBe(true)
  await page.reload()
  await expect(page.locator('main canvas').first()).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('info-open').click()
  await expect(page.locator('[data-fact="cover"]')).toHaveText(/cover\.png/, { timeout: 15_000 })
  for (const record of albums)
    await forgetRecord(page, 'musicbrainz', { kind: 'album', name: String(record.value.name) })
  await disconnect(page)
  await chooseSources(page)
})

test('offers no cover action for a cover inside the files, and says where it is', async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  test.skip(!SERIAL, 'E2E_SERIAL is required against a real gateway')
  await chooseSources(page, { musicbrainz: { allowed: true }, coverartarchive: { allowed: true } })
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/album/Blue%20Hours/Mira%20Sol')
  await page.getByTestId('info-open').click()
  const panel = page.getByTestId('info-panel')
  await expect(panel.locator('[data-fact="cover"]')).toHaveText('Inside the album’s files', { timeout: 15_000 })
  // Replacing it needs tag editing, which the page does not do: no action and no promise (owner, 2026-10-02).
  await expect(panel.getByTestId('info-cover-choose')).toHaveCount(0)
  await expect(panel.getByTestId('info-cover-note')).toHaveCount(0)
  await expect(panel).not.toContainText(/later/i)
  // An album whose files carry no cover keeps the action.
  await page.goto('/#/album/Night%20Drive/Northline')
  await page.getByTestId('info-open').click()
  await expect(page.getByTestId('info-panel').getByTestId('info-cover-choose')).toBeEnabled({ timeout: 15_000 })
  await disconnect(page)
  await chooseSources(page)
})

test("chooses an artist's photo and background among the sources, keeps them on the player with their credit", async ({
  page,
}) => {
  test.skip(external, 'Needs the mock collection')
  test.skip(!SERIAL, 'E2E_SERIAL is required against a real gateway')
  const NORTHLINE = '6f1d2c3b-0000-4000-8000-00000000a001'
  const NAMESAKE = '6f1d2c3b-0000-4000-8000-00000000a002'
  const asked: URL[] = []
  const cors = { 'Access-Control-Allow-Origin': '*' }
  await page.route('https://musicbrainz.org/ws/2/**', async (route) => {
    const url = new URL(route.request().url())
    asked.push(url)
    await route.fulfill({
      headers: cors,
      json:
        url.pathname === '/ws/2/artist/'
          ? {
              artists: [
                { id: NAMESAKE, name: 'Northline', score: 96, type: 'Person', country: 'US', disambiguation: 'singer' },
                {
                  id: NORTHLINE,
                  name: 'Northline',
                  'sort-name': 'Northline',
                  score: 100,
                  type: 'Group',
                  country: 'GB',
                  'life-span': { begin: '2001-03' },
                  disambiguation: 'synth-pop band',
                },
              ],
            }
          : url.pathname.endsWith(NORTHLINE)
            ? {
                relations: [
                  { type: 'image', url: { resource: 'https://commons.wikimedia.org/wiki/File:Northline_live.jpg' } },
                  { type: 'official homepage', url: { resource: 'https://northline.example/' } },
                ],
              }
            : { relations: [] },
    })
  })
  await page.route('https://commons.wikimedia.org/**', (route) =>
    route.fulfill({
      headers: cors,
      json: {
        query: {
          pages: {
            '1': {
              imageinfo: [
                {
                  // Commons serves thumbnails from thumb.wikimedia.org (the owner's first try, 2026-09-29).
                  thumburl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/n/nl/Northline_live.jpg/500px.jpg',
                  url: 'https://upload.wikimedia.org/wikipedia/commons/n/nl/Northline_live.jpg',
                  descriptionurl: 'https://commons.wikimedia.org/wiki/File:Northline_live.jpg',
                  extmetadata: {
                    Artist: { value: '<a href="https://example.org">P.B. Rage</a>' },
                    LicenseShortName: { value: 'CC BY-SA 2.0' },
                    LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/2.0' },
                  },
                },
              ],
            },
          },
        },
      },
    }),
  )
  const fanartAsked: URL[] = []
  await page.route('https://webservice.fanart.tv/**', async (route) => {
    const url = new URL(route.request().url())
    fanartAsked.push(url)
    await route.fulfill({
      headers: cors,
      json: url.pathname.endsWith(NORTHLINE)
        ? {
            artistthumb: [
              { id: '1', url: 'https://assets.fanart.tv/fanart/northline-a.jpg', likes: '3' },
              { id: '2', url: 'https://assets.fanart.tv/fanart/northline-b.jpg', likes: '1' },
            ],
            artistbackground: [{ id: '3', url: 'https://assets.fanart.tv/fanart/northline-wide.jpg', likes: '2' }],
          }
        : {},
    })
  })
  const pictureHosts: string[] = []
  for (const host of [
    'https://thumb.wikimedia.org/**',
    'https://upload.wikimedia.org/**',
    'https://assets.fanart.tv/**',
  ])
    await page.route(host, (route) => {
      pictureHosts.push(new URL(route.request().url()).hostname)
      return route.fulfill({ headers: cors, contentType: 'image/png', path: 'tests/e2e/fixtures/cover.png' })
    })
  await chooseSources(page, {
    musicbrainz: { allowed: true },
    wikimedia: { allowed: true },
    fanarttv: { allowed: true, key: 'personal-test-key' },
  })
  await english(page)
  // Without a photo, the cover of an album of the artist stands in on the Artists page.
  await page.goto('/#/artists')
  await expect(page.getByRole('article').filter({ hasText: 'Mira Sol' }).first().locator('canvas')).toBeVisible({
    timeout: 15_000,
  })
  expect(asked).toHaveLength(0)
  await connectAndPair(page)
  await page.goto('/#/artist/Northline')
  // The details (i): nothing is asked until the listener identifies the artist (owner, 2026-10-01).
  await page.getByTestId('info-open').click()
  const panel = page.getByTestId('info-panel')
  const fact = (key: string) => panel.locator(`[data-fact="${key}"]`)
  await expect(fact('musicbrainz')).toContainText('Not identified yet')
  expect(asked).toHaveLength(0)
  // Identified in its own window, among the candidates (owner, 2026-10-02).
  await fact('musicbrainz').getByTestId('fact-identify').click()
  const candidates = page.getByTestId('identify-choices').getByRole('button')
  await expect(candidates).toHaveCount(2, { timeout: 15_000 })
  // Named exactly so, the best score first; the namesake shows what tells it apart.
  await expect(candidates.first()).toHaveText('Northline · Group · United Kingdom · 2001– · synth-pop band')
  expect(asked[0]?.searchParams.get('query')).toBe('artist:"Northline" OR alias:"Northline"')
  await candidates.first().click()
  await page.getByTestId('identify-confirm').click()
  await expect(fact('musicbrainz')).toContainText('Confirmed and kept on the player', { timeout: 15_000 })
  await expect(fact('type')).toHaveText('Group')
  await expect(fact('country')).toHaveText('United Kingdom')
  await expect(fact('years')).toHaveText('2001–')
  await expect(fact('links').getByRole('link', { name: 'MusicBrainz' })).toHaveAttribute(
    'href',
    `https://musicbrainz.org/artist/${NORTHLINE}`,
  )
  await expect(fact('links').getByRole('link', { name: 'Website' })).toHaveAttribute(
    'href',
    'https://northline.example/',
  )
  await expect(page.getByText(/albums? · Group · United Kingdom · 2001–$/)).toBeVisible()
  // The photo, in a window of photos only: the confirmed artist, both sources, fanart.tv first.
  await panel.getByTestId('info-photo-choose').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByTestId('images-identity')).toContainText(
    'MusicBrainz: Northline · Group · United Kingdom · 2001– · synth-pop band',
    { timeout: 15_000 },
  )
  const photos = dialog.getByTestId('images-photos').getByRole('button')
  await expect(photos).toHaveCount(3, { timeout: 15_000 })
  await expect(dialog.getByTestId('images-backgrounds')).toHaveCount(0)
  await expect(photos.first()).toHaveAccessibleName('Photo: fanart.tv')
  await expect(photos.last()).toHaveAccessibleName('Photo: Wikimedia Commons')
  expect(fanartAsked[0]?.searchParams.get('api_key')).toBe('personal-test-key')
  // A namesake can be chosen instead; its sources hold nothing here.
  await dialog.getByTestId('images-other-artist').click()
  const artists = dialog.getByTestId('images-artists').getByRole('button')
  await expect(artists).toHaveCount(2, { timeout: 15_000 })
  await artists.filter({ hasText: 'singer' }).click()
  await expect(dialog.getByTestId('images-status')).toHaveText('The allowed sources have no images of this artist.')
  await dialog.getByTestId('images-other-artist').click()
  await artists.filter({ hasText: 'synth-pop band' }).click()
  await expect(photos).toHaveCount(3, { timeout: 15_000 })
  await photos.last().click()
  await dialog.getByTestId('images-save').click()
  await expect(dialog).toBeHidden({ timeout: 15_000 })
  // The background, in its own window.
  await panel.getByTestId('info-background-choose').click()
  await expect(dialog.getByTestId('images-photos')).toHaveCount(0)
  await dialog.getByTestId('images-backgrounds').getByRole('button').first().click({ timeout: 15_000 })
  await dialog.getByTestId('images-save').click()
  await expect(dialog).toBeHidden({ timeout: 15_000 })
  // Kept on the player with the credit and licence of each image, in the table.
  const photoCredit = fact('photo')
  const backgroundCredit = fact('background')
  await expect(photoCredit).toContainText('P.B. Rage · CC BY-SA 2.0 · Wikimedia Commons · kept on the player')
  await expect(backgroundCredit).toContainText('fanart.tv · CC BY 3.0 · kept on the player')
  await expect(page.getByTestId('heading-backdrop')).toBeAttached()
  await expect(panel.getByTestId('info-background-image')).toBeVisible()
  expect((await storeRecords(page, 'artist_images')).map((record) => record.key)).toEqual([
    ['Northline', 'photo'],
    ['Northline', 'background'],
  ])
  expect(
    (await storeRecords(page, 'musicbrainz')).find((record) => record.value.kind === 'artist')?.value,
  ).toMatchObject({
    kind: 'artist',
    name: 'Northline',
    mbid: NORTHLINE,
  })
  // Another browser reads the choice from the player: a reload with nothing kept here.
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        const request = indexedDB.deleteDatabase('disc-player')
        request.onsuccess = request.onerror = request.onblocked = () => done()
      }),
  )
  await page.reload()
  await page.getByTestId('info-open').click()
  await expect(photoCredit).toContainText('kept on the player', { timeout: 15_000 })
  await panel.getByTestId('fact-remove-photo').click()
  await panel.getByTestId('fact-remove-background').click()
  await expect(photoCredit).toContainText('For now, the cover of the album you play most')
  await expect(backgroundCredit).toContainText('None yet')
  // Set to work automatically, the best images are taken as the page opens and kept in this browser only.
  await chooseSources(page, {
    musicbrainz: { allowed: true },
    wikimedia: { allowed: true, auto: true },
    fanarttv: { allowed: true, auto: true, key: 'personal-test-key' },
  })
  await page.reload()
  await page.getByTestId('info-open').click()
  await expect(photoCredit).toContainText('fanart.tv · CC BY 3.0 · kept in this browser', { timeout: 15_000 })
  await expect(backgroundCredit).toContainText('kept in this browser')
  expect(await storeRecords(page, 'artist_images')).toEqual([])
  await panel.getByTestId('fact-remove-photo').click()
  await panel.getByTestId('fact-remove-background').click()
  await forgetRecord(page, 'musicbrainz', { kind: 'artist', name: 'Northline' })
  await chooseSources(page)
  await disconnect(page)
})

test('keeps the outside sources on the player: off until allowed, changed only when paired', async ({ page }) => {
  test.skip(external, 'Needs the mock store')
  test.skip(!SERIAL, 'E2E_SERIAL is required against a real gateway')
  await chooseSources(page)
  await english(page)
  await page.goto('/#/settings?part=sources')
  // The address opens the page at its part.
  await expect(page.getByRole('heading', { name: /^External sources/ })).toBeInViewport()
  const sources = page.getByTestId('settings-sources')
  await expect(sources.getByTestId('sources-blocked')).toContainText(
    "Pair this browser with the player's serial number",
  )
  for (const name of ['lrclib', 'coverartarchive', 'wikimedia']) {
    await expect(sources.getByTestId(`source-${name}-allow`)).toBeDisabled()
    await expect(sources.getByTestId(`source-${name}-allow`)).not.toBeChecked()
  }
  await expect(sources.getByRole('heading', { name: 'Artist images' })).toBeVisible()
  // Each source names the hosts it reaches: Cover Art Archive's images come from archive.org.
  await expect(sources.getByTestId('source-coverartarchive-hosts')).toHaveText(
    'Reaches: coverartarchive.org, archive.org, *.archive.org.',
  )
  await connectAndPair(page)
  await expect(sources.getByTestId('sources-blocked')).toHaveCount(0)
  const allow = sources.getByTestId('source-wikimedia-allow')
  const auto = sources.getByTestId('source-wikimedia-auto')
  // Commons is found by MusicBrainz ids: it waits for MusicBrainz, which is asked only through other sources.
  await expect(sources.getByTestId('source-wikimedia-needs')).toHaveText('Needs MusicBrainz: allow it first.')
  await expect(allow).toBeDisabled()
  await expect(sources.getByTestId('source-musicbrainz-auto')).toHaveCount(0)
  const musicbrainz = sources.getByTestId('source-musicbrainz-allow')
  await musicbrainz.check()
  await expect(sources.getByTestId('source-wikimedia-needs')).toHaveCount(0)
  // fanart.tv takes the owner's personal key: without it the source cannot be allowed.
  const fanart = sources.getByTestId('source-fanarttv')
  await expect(sources.getByTestId('source-fanarttv-needs')).toHaveText('Needs your personal key: enter it below.')
  await expect(sources.getByTestId('source-fanarttv-allow')).toBeDisabled()
  const keyField = fanart.getByLabel('Personal API key')
  await keyField.fill('not a key')
  await fanart.getByRole('button', { name: 'Save key' }).click()
  await expect(fanart).toContainText('A key has letters, digits, dots, dashes and underscores only.')
  await keyField.fill('personal-test-key')
  await fanart.getByRole('button', { name: 'Save key' }).click()
  await expect(fanart).toContainText('Your personal key is saved.')
  await expect(sources.getByTestId('source-fanarttv-allow')).toBeEnabled()
  const record = (await storeRecords(page, 'external_sources')).find((item) => item.value.source === 'fanarttv')
  expect(record?.value.api_key).toBe('personal-test-key')
  await fanart.getByRole('button', { name: 'Forget key' }).click()
  await expect(sources.getByTestId('source-fanarttv-allow')).toBeDisabled()
  await allow.check()
  await auto.check()
  // Kept on the player: read back after a reload.
  await page.reload()
  await expect(auto).toBeChecked({ timeout: 15_000 })
  // Without MusicBrainz the choice stays in place, dimmed and out of reach.
  await musicbrainz.uncheck()
  await expect(allow).toBeDisabled()
  await expect(allow).toBeChecked()
  await musicbrainz.check()
  // Stopping a source stops its automatic use too.
  await allow.uncheck()
  await expect(auto).not.toBeChecked()
  await expect(auto).toBeDisabled()
  // A card release without the collection keeps every source off and says why.
  expect((await page.request.post('/__mock/sources-missing?on=1')).status()).toBe(204)
  await page.reload()
  await expect(sources.getByTestId('sources-blocked')).toContainText('update Disc Player on its card', {
    timeout: 15_000,
  })
  expect((await page.request.post('/__mock/sources-missing?on=0')).status()).toBe(204)
  await chooseSources(page)
  await disconnect(page)
})

test('shows a karaoke line without word timings white among grey ones, as the side panel', async ({ page }) => {
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
  // As in the side panel: the current line plain white, the lines around it grey.
  await expect(current.locator('span')).toHaveCount(0)
  expect(await current.evaluate((element) => getComputedStyle(element).color)).toBe('rgb(255, 255, 255)')
  // Lines fade over half a second as they change: wait for it.
  await expect.poll(() => current.evaluate((element) => Number(getComputedStyle(element).opacity))).toBe(1)
  const next = page.getByTestId('karaoke').locator('[data-line="1"]')
  await expect(next).toHaveText('Weightless, second line')
  await expect
    .poll(() => next.evaluate((element) => Number(getComputedStyle(element).opacity)))
    .toBeLessThanOrEqual(0.5)
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
  // The panel shows a pause as karaoke does: three dots, not a note.
  const pause = page.getByTestId('lyrics').locator('[data-line="4"]')
  await expect(pause.getByTestId('lyrics-pause').locator('span')).toHaveCount(3)
  await expect(pause).toHaveAttribute('aria-label', 'Go to this line')
  await expect(page.getByTestId('lyrics')).not.toContainText('♪')
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

test('shows what takes space on the card by format, album and artist', async ({ page, request }) => {
  test.skip(external, 'Needs the mock collection')
  const walks = async () => ((await (await request.get('/__mock/tree-reads')).json()) as { reads: number }).reads
  const before = await walks()
  await english(page)
  // The connection dialog's card bar leads to the view.
  await openConnection(page)
  await page
    .getByRole('dialog')
    .getByRole('link', { name: /What takes space/ })
    .click()
  await expect(page).toHaveURL(/#\/card$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Card' })).toBeVisible()
  // Combined-009: every library file is measured in one walk of the card.
  await expect(page.getByText(/^Measured (\d+) of \1 files$/)).toBeVisible({ timeout: 30_000 })
  expect(await walks()).toBe(before + 1)
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
  // An artist shows its picture, else the cover of the album that stands for it, as on the Artists page.
  await expect(page.getByTestId('space-artists').getByRole('listitem').first().locator('canvas')).toHaveCount(1, {
    timeout: 15_000,
  })
  await expect(page.getByRole('heading', { name: /Possible duplicates/ })).toBeVisible()
  // Album rows link the album (title and cover) and its artist.
  await first.getByRole('link', { name: 'Mira Sol' }).click()
  await expect(page).toHaveURL(/#\/artist\/Mira%20Sol$/)
  await page.goBack()
  await page.getByTestId('space-albums').getByRole('listitem').first().getByRole('link', { name: 'Blue Hours' }).click()
  await expect(page).toHaveURL(/#\/album\/Blue%20Hours/)
})

test('a file the card walk did not find counts as unreadable, and the card is walked once', async ({
  page,
  request,
}) => {
  test.skip(external, 'Needs the mock gateway')
  const walks = async () => ((await (await request.get('/__mock/tree-reads')).json()) as { reads: number }).reads
  await request.post('/__mock/info-missing?title=Last%20Exit')
  try {
    await english(page)
    await page.goto('/#/card')
    await expect(page.getByText(/^Measured (\d+) of \d+ files · 1 file could not be read$/)).toBeVisible({
      timeout: 30_000,
    })
    const after = await walks()
    // Measured and remembered: a later visit walks the card no more.
    await page.waitForTimeout(500)
    await page.reload()
    await page.goto('/#/albums')
    await page.goto('/#/card')
    await expect(page.getByText(/· 1 file could not be read$/)).toBeVisible({ timeout: 30_000 })
    expect(await walks()).toBe(after)
    // Measure again walks it once more.
    await page.getByRole('button', { name: 'Measure again' }).click()
    await expect.poll(walks).toBe(after + 1)
  } finally {
    await request.post('/__mock/info-missing?title=')
  }
})

test('remembers a file the media route could not measure instead of asking on every visit', async ({
  page,
  request,
}) => {
  test.skip(external, 'Needs the mock gateway')
  // An image before combined-009: no card walk, one media read per file.
  await request.post('/__mock/image?version=008')
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
    // A later visit asks for it no more (the browser writes the miss down right after showing it).
    await page.waitForTimeout(500)
    await page.reload()
    await page.goto('/#/albums')
    await page.goto('/#/card')
    await expect(page.getByText(/· 1 file could not be read$/)).toBeVisible({ timeout: 30_000 })
    expect(await reads()).toBe(before)
  } finally {
    await request.post('/__mock/info-missing?title=')
    await request.post('/__mock/image?version=009')
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
    const panel = page.getByRole('complementary', { name: 'Queue' })
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
