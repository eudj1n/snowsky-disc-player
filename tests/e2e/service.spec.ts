/**
 * The service's own features on the mock gateway (combined-008): disliked
 * tracks and pins on the store, the trash with macOS leftovers, playback in
 * the browser and the diagnostics disclosure. Each test leaves the shared
 * mock as it found it, so both projects run against the same server.
 */
import { expect, test, type Page } from '@playwright/test'
import { connectAndPair, disconnect, english, external, openConnection, SERIAL, watchErrors } from './helpers'

test.describe.configure({ mode: 'serial' })
test.skip(() => !SERIAL || external, 'Needs the mock gateway and a serial number')

const status = (page: Page, text: string | RegExp) => page.getByRole('status').filter({ hasText: text })

test('dislikes a track from its menu and Now Playing, lists it and takes it back', async ({ page }) => {
  const errors = watchErrors(page)
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/album/Blue%20Hours/Mira%20Sol')
  await page.getByRole('button', { name: 'Track actions: Window Seat' }).click()
  await page.getByRole('dialog', { name: 'Track actions' }).getByRole('menuitem', { name: 'Dislike' }).click()
  await expect(status(page, 'Disliked: hidden and skipped from now on.')).toBeVisible()
  // Started from the page that holds control, it is skipped with Next once the selection is confirmed.
  await page.getByRole('button', { name: 'Play Window Seat' }).click()
  await expect(status(page, 'Done. Verified on DISC.')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('track-title')).toHaveText('An Open Door', { timeout: 15_000 })
  await page.getByTestId('toggle').click()
  await expect(page.getByTestId('toggle')).toHaveAttribute('aria-label', 'Play', { timeout: 15_000 })

  await page.goto('/#/favorites')
  await page.getByTestId('disliked-link').click()
  await expect(page).toHaveURL(/#\/disliked$/)
  const list = page.getByTestId('disliked-list')
  await expect(list.getByText('Window Seat')).toBeVisible()
  await list.getByRole('button', { name: 'Track actions: Window Seat' }).click()
  await page.getByRole('dialog', { name: 'Track actions' }).getByRole('menuitem', { name: 'Remove dislike' }).click()
  await expect(status(page, 'No longer disliked.')).toBeVisible()
  await expect(page.getByTestId('disliked-empty')).toBeVisible()

  // The current track: the listening panel's button, there and back.
  await page.getByRole('button', { name: 'Open Now Playing panel' }).click()
  const panel = page.getByRole('complementary', { name: 'Player view' })
  const dislike = panel.getByTestId('now-dislike')
  await expect(dislike).toHaveAttribute('aria-label', 'Dislike')
  await dislike.click()
  await expect(dislike).toHaveAttribute('aria-label', 'Remove dislike')
  await dislike.click()
  await expect(dislike).toHaveAttribute('aria-label', 'Dislike')
  await page.keyboard.press('Escape')
  await disconnect(page)
  expect(errors).toEqual([])
})

test('pins an album and an artist, which lead Home and the lists', async ({ page }) => {
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/album/Blue%20Hours/Mira%20Sol')
  const album = page.getByTestId('pin-album')
  await album.click()
  await expect(status(page, /^Pinned\.$/)).toBeVisible()
  await expect(album).toHaveAttribute('aria-pressed', 'true')
  await page.goto('/#/artist/Mira%20Sol')
  const artist = page.getByTestId('pin-artist')
  await artist.click()
  await expect(artist).toHaveAttribute('aria-pressed', 'true')

  await page.goto('/#/')
  const pinned = page.getByTestId('pinned')
  await expect(pinned.getByRole('link', { name: 'Open Blue Hours' })).toBeVisible()
  await expect(pinned.getByTestId('pinned-artists').getByRole('link', { name: 'Mira Sol' })).toBeVisible()
  await page.goto('/#/albums')
  await expect(page.getByRole('main').getByRole('heading', { level: 3 }).first()).toHaveText('Blue Hours')
  // A pinned card carries its mark on the cover, always shown; the others none.
  const cards = page.getByRole('main').getByRole('article')
  await expect(cards.first().getByTestId('pinned-mark')).toBeVisible()
  await expect(cards.nth(1).getByTestId('pinned-mark')).toHaveCount(0)
  await page.goto('/#/artists')
  await expect(
    page.getByRole('main').getByRole('article').filter({ hasText: 'Mira Sol' }).first().getByTestId('pinned-mark'),
  ).toBeVisible()

  await page.goto('/#/album/Blue%20Hours/Mira%20Sol')
  await album.click()
  await expect(status(page, 'Unpinned.')).toBeVisible()
  await expect(album).toHaveAttribute('aria-pressed', 'false')
  await page.goto('/#/artist/Mira%20Sol')
  await artist.click()
  await expect(artist).toHaveAttribute('aria-pressed', 'false')
  await page.goto('/#/')
  await expect(page.getByTestId('pinned')).toHaveCount(0)
  await page.goto('/#/albums')
  await expect(page.getByRole('main').getByRole('heading', { level: 3 }).first()).toBeVisible()
  await expect(page.getByTestId('pinned-mark')).toHaveCount(0)
  await disconnect(page)
})

test('moves a folder to the trash, restores it, clears macOS leftovers and empties the trash', async ({
  page,
}, info) => {
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/card/files')
  const name = `Trash me ${info.project.name}`
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByRole('textbox', { name: 'Folder name' }).fill(name)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByTestId('files-path')).toContainText(name, { timeout: 15_000 })
  await page.getByTestId('files-path').getByRole('link', { name: 'Card' }).click()

  const list = page.getByTestId('files-list')
  const row = list.getByRole('listitem').filter({ hasText: name })
  const moveToTrash = async () => {
    await row.hover()
    page.once('dialog', (dialog) => void dialog.accept())
    await row.getByRole('button', { name: `Move to trash: ${name}` }).click()
    await expect(status(page, 'Moved to the trash.')).toBeVisible()
    await expect(row).toHaveCount(0)
  }
  await moveToTrash()
  await expect(page.getByTestId('trash-rescan')).toBeVisible()

  await page.getByRole('navigation', { name: 'Card views' }).getByRole('link', { name: 'Trash' }).click()
  const entries = page.getByTestId('trash-list')
  const entry = entries.getByRole('listitem').filter({ hasText: name })
  await expect(entry).toContainText('From the card')
  await entry.getByRole('button', { name: 'Restore' }).click()
  await expect(status(page, 'Restored.')).toBeVisible()
  await expect(entry).toHaveCount(0)

  // What macOS left moves as one entry and comes back from it.
  const leftovers = page.getByTestId('leftovers')
  await expect(leftovers).toContainText('4 files')
  await leftovers.getByRole('button', { name: 'Move to trash' }).click()
  await expect(status(page, 'macOS leftovers moved to the trash.')).toBeVisible()
  await expect(leftovers).toContainText('None on the card.')
  // The Space tab counts the trash and links to it.
  await page.getByRole('navigation', { name: 'Card views' }).getByRole('link', { name: 'Space' }).click()
  await expect(page.getByTestId('space-trash')).toContainText('In the trash')
  await page.getByTestId('space-trash').click()
  await expect(page).toHaveURL(/#\/card\/trash$/)
  const mac = entries.getByRole('listitem').filter({ hasText: 'macOS leftovers' })
  await mac.getByRole('button', { name: 'Restore' }).click()
  await expect(leftovers).toContainText('4 files')

  await page.getByRole('navigation', { name: 'Card views' }).getByRole('link', { name: 'Files' }).click()
  await expect(row).toBeVisible()
  await moveToTrash()
  await page.getByRole('navigation', { name: 'Card views' }).getByRole('link', { name: 'Trash' }).click()
  // A dismissed confirmation deletes nothing.
  page.once('dialog', (dialog) => void dialog.dismiss())
  await entry.getByRole('button', { name: 'Delete permanently' }).click()
  await expect(entry).toBeVisible()
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByTestId('trash-empty').click()
  await expect(status(page, 'The trash is empty now.')).toBeVisible()
  await expect(page.getByTestId('trash-nothing')).toBeVisible()
  await disconnect(page)
})

test('plays a track in this browser, pauses and stops it', async ({ page }) => {
  const errors = watchErrors(page)
  await english(page)
  await page.goto('/#/album/Blue%20Hours/Mira%20Sol')
  await page.getByRole('button', { name: 'Track actions: Window Seat' }).click()
  await page
    .getByRole('dialog', { name: 'Track actions' })
    .getByRole('menuitem', { name: 'Play in this browser' })
    .click()
  const bar = page.getByTestId('browser-player')
  await expect(bar).toContainText('Window Seat')
  const toggle = bar.getByTestId('browser-toggle')
  await expect(toggle).toHaveAttribute('aria-label', 'Pause', { timeout: 10_000 })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-label', 'Play')
  await bar.getByTestId('browser-stop').click()
  await expect(bar).toBeHidden()
  // A whole album plays in order, one track after another.
  await page.getByTestId('album-browser').click()
  await expect(bar).toBeVisible()
  const first = await bar.locator('strong').textContent()
  await bar.getByRole('button', { name: 'Next track' }).click()
  await expect(bar.locator('strong')).not.toHaveText(first ?? '')
  await bar.getByTestId('browser-stop').click()
  await expect(bar).toBeHidden()
  expect(errors).toEqual([])
})

test('draws what plays in this browser as the disc visualizer', async ({ page }) => {
  const errors = watchErrors(page)
  await english(page)
  await page.goto('/#/album/Blue%20Hours/Mira%20Sol')
  await page.getByTestId('album-browser').click()
  const bar = page.getByTestId('browser-player')
  await expect(bar.getByTestId('browser-toggle')).toHaveAttribute('aria-label', 'Pause', { timeout: 10_000 })
  await bar.getByTestId('visualizer-open').click()
  const visualizer = page.getByRole('dialog', { name: 'Visualizer' })
  await expect(visualizer).toBeVisible()
  await expect(visualizer).toContainText(await bar.locator('strong').innerText())
  // The analyser hears the mock's tones and the canvas fills the screen.
  await expect(visualizer).toHaveAttribute('data-live', 'true', { timeout: 10_000 })
  const box = await page.getByTestId('visualizer-canvas').boundingBox()
  expect(box?.width).toBe(page.viewportSize()?.width)
  // Space pauses this browser's playback, not the player's.
  await page.keyboard.press('Space')
  await expect(visualizer.getByTestId('visualizer-toggle')).toHaveAttribute('aria-label', 'Play')
  await visualizer.getByTestId('visualizer-toggle').click()
  await expect(visualizer.getByTestId('visualizer-toggle')).toHaveAttribute('aria-label', 'Pause')
  await page.keyboard.press('Escape')
  await expect(visualizer).toBeHidden()
  // V opens it again; stopping the browser's playback closes it.
  await page.keyboard.press('v')
  await expect(visualizer).toBeVisible()
  await page.keyboard.press('v')
  await expect(visualizer).toBeHidden()
  await bar.getByTestId('browser-stop').click()
  await expect(bar).toBeHidden()
  await page.keyboard.press('v')
  await expect(visualizer).toBeHidden()
  expect(errors).toEqual([])
})

test("shows the service's diagnostics in the connection dialog", async ({ page }) => {
  await english(page)
  await openConnection(page)
  const diagnostics = page.getByRole('dialog').getByTestId('diagnostics')
  await diagnostics.getByText('Diagnostics', { exact: true }).click()
  await expect(diagnostics).toContainText('0.8.0 · build mock')
  await expect(diagnostics).toContainText('usb-engineering · 2.57')
  await expect(diagnostics).toContainText('from the card · 2026.09.29')
  await expect(diagnostics).toContainText('ok, schema 4')
  await expect(diagnostics).toContainText('restarted after signal 11')
  await expect(diagnostics).toContainText('Skip rule: skipped to the next track')
  await page.keyboard.press('Escape')
})
