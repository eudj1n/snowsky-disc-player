import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  connectAndPair,
  disconnect,
  english,
  external,
  LANGUAGES,
  openConnection,
  TOKEN,
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
  await page.getByRole('button', { name: '← Northline' }).click()
  await expect(page).toHaveURL(/#\/artist\/Northline$/)
})

test('browses genres, narrows mixed albums and filters tracks by genre', async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  await english(page)
  await page.goto('/#/genres')
  await page.getByRole('link', { name: /^Jazz\b/ }).click()
  await expect(page).toHaveURL(/#\/genre\/Jazz$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Jazz' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Artists' }).getByRole('heading', { name: 'Mira Sol' })).toBeVisible()
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

test('pairs with the player serial number when the card allows it', async ({ page }) => {
  test.skip(external, 'Needs the mock collection')
  await english(page)
  await openConnection(page)
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('SN under About device')).toBeVisible()
  await dialog.getByLabel('Serial number or token').fill('0000 0000 0000 00')
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
  await dialog.getByLabel('Serial number or token').fill('1111 1111 1111 11')
  await dialog.getByRole('button', { name: 'Pair' }).click()
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(dialog.getByText('did not accept the saved token or serial number')).toBeVisible()
  await expect(dialog.getByLabel('Serial number or token')).toBeVisible()
})

test('connects on the first Play when paired, then follows keyboard shortcuts', async ({ page }) => {
  test.skip(!TOKEN || external, 'Needs the mock collection and token')
  const errors = watchErrors(page)
  await english(page)
  await openConnection(page)
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(PAIRING_FIELD).fill(TOKEN ?? '')
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
    await page.keyboard.press('Escape')
    await disconnect(page)
  })

  test('removes a favorite that is not playing after confirmation', async ({ page }) => {
    await english(page)
    await connectAndPair(page)
    await page.goto('/#/favorites')
    const rows = page.getByRole('row')
    await expect(rows.first()).toBeVisible()
    const before = await rows.count()
    const heart = page.getByRole('button', { name: /^Remove from favorites: / }).first()
    const title = ((await heart.getAttribute('aria-label')) ?? '').replace('Remove from favorites: ', '')
    await heart.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText(title)
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(dialog).toBeHidden({ timeout: 20_000 })
    await expect(rows).toHaveCount(before - 1, { timeout: 20_000 })
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
    await expect(dialog.getByRole('button', { name: 'Transfer to DISC' })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Send again' }).click()
    await dialog.getByRole('button', { name: 'Transfer to DISC' }).click()
    await expect(dialog.getByTestId('import-flow')).toHaveText(/confirmed files are on the card/, { timeout: 20_000 })
    await page.keyboard.press('Escape')
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
