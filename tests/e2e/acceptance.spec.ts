/**
 * Emulator acceptance against real stock (V2.57 guest), run explicitly:
 *
 *   tests/e2e/emulator/media.sh <container>
 *   E2E_ACCEPTANCE=emulator E2E_BASE_URL=http://127.0.0.1:17870 \
 *     E2E_SERIAL=00000000000000 \
 *     npx playwright test --project=desktop
 *   tests/e2e/emulator/media.sh <container> remove
 *
 * It changes playlists, sound and EQ, the service's store and trash, and
 * uploads a file, so it refuses to run without E2E_ACCEPTANCE=emulator: never
 * point it at a real player.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { connectAndPair, disconnect, english, external, openConnection, SERIAL, watchErrors } from './helpers'

const enabled = external && Boolean(SERIAL) && process.env.E2E_ACCEPTANCE === 'emulator'
test.describe.configure({ mode: 'serial' })
// Playwright needs the fixtures pattern even when no fixture is used.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, info) => {
  test.skip(!enabled, 'Needs E2E_ACCEPTANCE=emulator with E2E_BASE_URL and E2E_SERIAL')
  test.skip(info.project.name !== 'desktop', 'Runs once, on desktop')
  test.setTimeout(240_000)
})

/** Runs one action and returns the toast it produced; waits for the previous toast to go first. */
async function outcome(page: Page, action: () => Promise<void>): Promise<string> {
  const toast = page.getByTestId('toast')
  await expect(toast).toBeHidden({ timeout: 15_000 })
  await action()
  await expect(toast).toBeVisible({ timeout: 45_000 })
  return (await toast.textContent())?.trim() ?? ''
}

async function verified(page: Page, action: () => Promise<void>): Promise<void> {
  expect(await outcome(page, action)).toBe('Done. Verified on DISC.')
}

async function flip(button: Locator): Promise<void> {
  const before = await button.getAttribute('aria-pressed')
  await button.click()
  await expect(button).not.toHaveAttribute('aria-pressed', before ?? '', { timeout: 30_000 })
}

test('scans the generated media, keeps same-titled albums apart and survives track switches', async ({ page }) => {
  const errors = watchErrors(page)
  await english(page)
  await connectAndPair(page)
  await page.getByRole('button', { name: 'Add music' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Start scan' }).click()
  await expect(dialog.getByTestId('scan-status')).toContainText('Scan ended', { timeout: 120_000 })
  await expect(dialog.getByTestId('import-flow')).toHaveText(/collection is up to date/, { timeout: 60_000 })
  await page.keyboard.press('Escape')

  await page.goto('/#/album/Harbor')
  const scopes = page.getByRole('navigation', { name: 'Albums with this title' })
  await expect(scopes.getByRole('link', { name: 'Kestrel' })).toBeVisible()
  await scopes.getByRole('link', { name: 'Lumen' }).click()
  // Tag order, not file order (files are Pier, Low Tide, Harbor Light).
  await expect(page.getByRole('row')).toHaveText([/Harbor Light/, /Low Tide/, /Pier/])
  await expect(
    page.getByRole('region', { name: 'More by Lumen' }).getByRole('heading', { name: 'Night Lines' }),
  ).toBeVisible()

  await verified(page, () => page.getByRole('button', { name: 'Play album' }).click())
  const title = page.getByTestId('track-title')
  await expect(title).toHaveText(/Harbor Light|Low Tide|Pier/)
  await expect(page.getByRole('region', { name: 'Player' }).getByRole('link', { name: 'Album: Harbor' })).toBeVisible()
  const first = (await title.textContent()) ?? ''
  await page.getByRole('button', { name: 'Next track' }).first().click()
  await expect(title).not.toHaveText(first, { timeout: 30_000 })
  // Partial a202 records follow a switch on stock: the player must stay.
  await page.waitForTimeout(2_000)
  await expect(title).toBeVisible()
  // Queue rows show the album's folder cover: their paths come from the persisted queue (LIST_SONG_0).
  await page.getByRole('button', { name: 'Open queue' }).click()
  const queue = page.getByRole('complementary', { name: 'Player view' })
  await expect(queue.locator('[data-cover=true] canvas')).toHaveCount(3, { timeout: 30_000 })
  await page.keyboard.press('Escape')
  await disconnect(page)
  // Busy answers (503) are retried by the page; the browser still logs the first one.
  expect(errors.filter((error) => !error.includes('status of 503'))).toEqual([])
})

test('plays genres, a genre album and a whole artist on stock', async ({ page }) => {
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/genres')
  await expect(page.getByRole('link', { name: /^Jazz\b/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Ambient\b/ })).toBeVisible()

  await page.goto('/#/genre/Jazz')
  await verified(page, () => page.getByRole('button', { name: 'Play genre' }).click())
  await expect(page.getByRole('region', { name: 'Player' }).getByRole('link', { name: 'Genre: Jazz' })).toBeVisible()
  await verified(page, () => page.getByRole('button', { name: 'Play Streetlight' }).click())

  // The Jazz Harbor is Kestrel's release: its card opens that release, not the whole title.
  await page.getByRole('list', { name: 'Albums' }).getByRole('heading', { name: 'Harbor' }).getByRole('link').click()
  await expect(page).toHaveURL(/#\/album\/Harbor\/Kestrel$/)
  await expect(page.getByRole('row')).toHaveText([/Crossing/, /Salt/])
  await verified(page, () => page.getByRole('button', { name: 'Play album' }).click())
  await expect(page.getByTestId('track-title')).toHaveText(/Crossing|Salt/)

  const unknown = await outcome(page, async () => {
    await page.goto('/#/genre/Unknown%20genre')
    await page.getByRole('button', { name: 'Play genre' }).click()
  })
  test.info().annotations.push({ type: 'unknown genre', description: unknown })
  console.log(`Unknown genre playback: ${unknown}`)

  await page.goto('/#/artists')
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Lumen', exact: true }) })
  await card.hover()
  await verified(page, () => card.getByRole('button', { name: 'Play Lumen' }).click())
  await expect(page.getByTestId('track-title')).toHaveText(
    /Harbor Light|Low Tide|Pier|Signal|Streetlight|Slack Water|Spring Tide|Neap/,
  )
  await disconnect(page)
})

test('controls transport, seek, volume and mute, modes, favorite and the queue on stock', async ({ page }) => {
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/album/Night%20Lines/Lumen')
  await verified(page, () => page.getByRole('button', { name: 'Play album' }).click())
  const toggle = page.getByTestId('toggle')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-label', 'Play', { timeout: 30_000 })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-label', 'Pause', { timeout: 30_000 })

  // The bottom bar is the one control surface on desktop (the panel repeats none since 2026-09-29).
  const panel = page.getByRole('region', { name: 'Player' })
  const seek = panel.getByRole('slider', { name: 'Seek position' })
  await seek.dispatchEvent('pointerdown')
  await seek.fill('12')
  await expect(page.getByRole('status').filter({ hasText: 'Position confirmed' }).first()).toBeAttached({
    timeout: 30_000,
  })

  const volume = panel.getByRole('slider', { name: 'DISC volume' })
  const output = panel.locator('output').first()
  const original = (await output.textContent())?.trim() ?? '30'
  await verified(page, () => volume.fill(original === '25' ? '26' : '25'))
  await panel.getByRole('button', { name: 'Mute' }).click()
  await expect(output).toHaveText('0', { timeout: 30_000 })
  await panel.getByRole('button', { name: 'Unmute' }).click()
  await expect(output).not.toHaveText('0', { timeout: 30_000 })
  await verified(page, () => volume.fill(original))

  const shuffle = panel.getByRole('button', { name: 'Shuffle' })
  await flip(shuffle)
  await flip(shuffle)
  const favorite = panel.getByRole('button', { name: /^(Favorite|Unfavorite) the current track$/ })
  await flip(favorite)
  await flip(favorite)

  await page.getByRole('button', { name: 'Open queue' }).click()
  const queue = page.getByRole('complementary', { name: 'Player view' })
  await queue
    .getByRole('button', { name: /^Select in queue / })
    .first()
    .click()
  await expect(queue.locator('[aria-current=true]')).toHaveCount(1, { timeout: 30_000 })
  await page.keyboard.press('Escape')
  await disconnect(page)
})

test('creates, fills, plays, trims, renames and deletes a playlist on stock', async ({ page }) => {
  await english(page)
  await connectAndPair(page)
  const name = `Acceptance ${String(Date.now() % 100_000)}`
  const dialog = page.getByRole('dialog')
  await page.goto('/#/playlists')
  await verified(page, async () => {
    await page.getByRole('button', { name: 'New playlist' }).click()
    await dialog.getByLabel('Playlist name').fill(name)
    await dialog.getByRole('button', { name: 'Create' }).click()
  })
  await page.goto('/#/album/Night%20Lines/Lumen')
  await verified(page, async () => {
    await page.getByRole('button', { name: 'Add to playlist' }).click()
    await dialog.getByRole('combobox').selectOption(name)
    await dialog.getByRole('button', { name: 'Add to playlist' }).click()
  })
  await page.goto('/#/playlists')
  await page.getByRole('heading', { name, exact: true }).getByRole('link').click()
  await expect(page.getByRole('row')).toHaveCount(2, { timeout: 30_000 })
  await verified(page, () => page.getByRole('button', { name: 'Listen' }).click())
  await verified(page, async () => {
    await page.getByRole('button', { name: 'Track actions: Signal' }).click()
    await page.getByRole('menuitem', { name: 'Remove from playlist' }).click()
    await dialog.getByRole('button', { name: 'Remove' }).click()
  })
  await expect(page.getByRole('row')).toHaveCount(1, { timeout: 30_000 })
  await verified(page, async () => {
    await page.getByRole('button', { name: 'Rename' }).click()
    await dialog.getByLabel('Playlist name').fill(`${name} R`)
    await dialog.getByRole('button', { name: 'Save' }).click()
  })
  await expect(page.getByRole('heading', { level: 1, name: `${name} R` })).toBeVisible({ timeout: 30_000 })
  // A playing playlist is not deleted: play an album first.
  const playlistUrl = page.url()
  await page.goto('/#/album/Harbor/Kestrel')
  await verified(page, () => page.getByRole('button', { name: 'Play album' }).click())
  await page.goto(playlistUrl)
  await verified(page, async () => {
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
  })
  await expect(page).toHaveURL(/#\/playlists$/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: `${name} R`, exact: true })).toHaveCount(0)
  await disconnect(page)
})

test('reads and changes sound settings and the equalizer on stock, then restores them', async ({ page }) => {
  await english(page)
  await connectAndPair(page)
  await page.getByRole('button', { name: 'Sound settings' }).filter({ visible: true }).first().click()
  const dialog = page.getByRole('dialog')
  const feedback = dialog.getByTestId('sound-feedback')
  await expect(feedback).toHaveText('Current values received from DISC.', { timeout: 30_000 })
  const gain = dialog.getByRole('group', { name: 'Gain' })
  const original =
    (await gain.getByRole('button', { name: 'High' }).getAttribute('aria-pressed')) === 'true' ? 'High' : 'Low'
  const other = original === 'High' ? 'Low' : 'High'
  await gain.getByRole('button', { name: other }).click()
  await expect(feedback).toHaveText('The player confirmed the new value.', { timeout: 30_000 })
  await gain.getByRole('button', { name: original }).click()
  await expect(gain.getByRole('button', { name: original })).toHaveAttribute('aria-pressed', 'true', {
    timeout: 30_000,
  })

  const panel = dialog.getByRole('region', { name: 'Equalizer' })
  const preset = panel.getByRole('combobox', { name: 'Preset' })
  await expect(preset).toBeEnabled({ timeout: 30_000 })
  const before = await preset.inputValue()
  const slot = before === '169' ? '168' : '169'
  const eqFeedback = dialog.getByTestId('eq-feedback')
  await preset.selectOption(slot)
  await expect(eqFeedback).toHaveText('The player confirmed the new value.', { timeout: 30_000 })
  const band = panel.getByRole('slider', { name: '1k Hz gain' })
  await band.fill('2')
  await panel.getByRole('button', { name: 'Apply' }).click()
  await expect(panel.getByRole('button', { name: 'Apply' })).toBeDisabled({ timeout: 30_000 })
  await expect(eqFeedback).toHaveText('The player confirmed the new value.')
  await expect(band).toHaveValue('2')
  await panel.getByRole('button', { name: 'Flatten' }).click()
  await panel.getByRole('button', { name: 'Apply' }).click()
  await expect(panel.getByRole('button', { name: 'Apply' })).toBeDisabled({ timeout: 30_000 })
  await preset.selectOption(before)
  await expect(preset).toHaveValue(before, { timeout: 30_000 })
  await expect(eqFeedback).toHaveText('The player confirmed the new value.', { timeout: 30_000 })
  await page.keyboard.press('Escape')
  await disconnect(page)
})

test('lists same-titled albums apart, separates discs, shows years and joint credits on stock', async ({ page }) => {
  await english(page)
  await page.goto('/#/albums')
  await expect(page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Harbor' }) })).toHaveCount(2)
  const tides = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Tide Tables' }) })
  await expect(tides.getByRole('link', { name: 'Lumen' })).toBeVisible()
  await page.goto('/#/album/Tide%20Tables')
  await expect(page.getByRole('navigation', { name: 'Albums with this title' })).toHaveCount(0)
  await expect(page.getByRole('rowheader')).toHaveText(['Disc 1', 'Disc 2'])
  await expect(page.getByRole('row').filter({ hasText: /Undertow|Slack Water|Spring Tide|Neap/ })).toHaveText([
    /Undertow/,
    /Slack Water/,
    /Spring Tide/,
    /Neap/,
  ])
  await expect(page.getByRole('main')).toContainText('2004', { timeout: 60_000 })
  // Stock keeps the two ARTIST fields as one artist, "Lumen;Kestrel".
  const undertow = page.getByRole('row').filter({ hasText: 'Undertow' })
  await expect(undertow.getByRole('link', { name: 'Lumen', exact: true })).toBeVisible()
  await undertow.getByRole('link', { name: 'Kestrel', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Appears on' }).getByRole('heading', { name: 'Tide Tables' }),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: 'Albums' }).getByRole('heading', { name: 'Harbor' })).toBeVisible()

  await connectAndPair(page)
  await page.goto('/#/album/Tide%20Tables')
  await verified(page, () => page.getByRole('button', { name: 'Play album' }).click())
  await expect(page.getByTestId('track-title')).toHaveText(/Undertow|Slack Water|Spring Tide|Neap/)
  await disconnect(page)
})

test('names the playing track as the library does when stock cuts long names, pauses from the bar', async ({
  page,
}) => {
  const album = 'Quiet Meridian (The Complete Anniversary Recordings)'
  const title = 'An Unusually Long Track Title for the Play State'
  // Evidence only: what stock itself sends for the playing track (the song
  // object arrives as an escaped JSON string inside the a202 payload).
  const sent = new Set<string>()
  page.on('websocket', (socket) =>
    socket.on('framereceived', ({ payload }) => {
      const text = typeof payload === 'string' ? payload : payload.toString('utf8')
      for (const match of text.matchAll(/\\?"(song_album_name|song_name)\\?":\s*\\?"([^"\\]*)/g))
        if (match[2]) sent.add(`${match[1]}=${match[2]}`)
    }),
  )
  await english(page)
  await connectAndPair(page)
  await page.goto(`/#/album/${encodeURIComponent(album)}`)
  await verified(page, () => page.getByRole('button', { name: 'Play album' }).click())
  await expect(page.getByTestId('track-title')).toHaveText(title, { timeout: 30_000 })
  // The compact bar of a scrolled page pauses the album it belongs to.
  await page.setViewportSize({ width: 1280, height: 520 })
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  const bar = page.getByTestId('sticky-heading')
  await bar.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(bar.getByRole('button', { name: 'Play', exact: true })).toBeVisible({ timeout: 30_000 })
  await page.setViewportSize({ width: 1280, height: 720 })
  await page
    .getByRole('region', { name: 'Player' })
    .getByRole('link', { name: `Album: ${album}` })
    .click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(album)
  await expect(page.getByRole('row').filter({ hasText: title })).toHaveCount(1)
  test.info().annotations.push({ type: 'stock names', description: [...sent].join(' | ') || 'not seen' })
  await disconnect(page)
})

test('keeps a play history with its source, favorites any row and reads the device on stock', async ({ page }) => {
  await english(page)
  await connectAndPair(page)
  // Device facts from the service: the guest's gauge (its battery overlay) and the card.
  await openConnection(page)
  const facts = page.getByRole('dialog').getByTestId('player-facts')
  await expect(facts).toContainText(/Battery\d+%/)
  await expect(facts).toContainText(/Card.+ free of /)
  await page.keyboard.press('Escape')
  // An album played past its track's threshold is a "Recently played" tile (an album
  // the other tests do not play, so none of them finds its track current and paused).
  const album = 'Quiet Meridian (The Complete Anniversary Recordings)'
  await page.goto(`/#/album/${encodeURIComponent(album)}`)
  await verified(page, () => page.getByRole('button', { name: 'Play album' }).click())
  // Half of the 25 s file counts as a play (about 12.5 s); pause well before it ends, since the
  // confirmation itself can take several seconds on the guest and a finished queue is resumed
  // elsewhere by the Play button.
  await page.waitForTimeout(14_000)
  await page.getByTestId('toggle').click()
  await page.goto('/#/')
  await page.reload()
  const shelf = page.getByRole('region', { name: 'Recently played' })
  await expect(shelf.getByRole('listitem').first()).toContainText(album, { timeout: 30_000 })
  // A track that is not playing becomes a favorite from its row, then leaves again.
  await page.goto('/#/album/Harbor/Kestrel')
  const row = page.getByRole('row').filter({ hasText: 'Salt' })
  await row.hover()
  await row.getByRole('button', { name: 'Add to favorites: Salt' }).click()
  const remove = row.getByRole('button', { name: 'Remove from favorites: Salt' })
  await expect(remove).toBeAttached({ timeout: 30_000 })
  await remove.click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
  await expect(row.getByRole('button', { name: 'Add to favorites: Salt' })).toBeAttached({ timeout: 30_000 })
  await disconnect(page)
})

test('marks only the playing track of a CUE image whose tracks share one file on stock', async ({ page }) => {
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/album/Image%20Sessions')
  await expect(page.getByRole('row')).toHaveText([/Opening Frame/, /Second Frame/, /Last Frame/], { timeout: 30_000 })
  await verified(page, () => page.getByRole('button', { name: 'Play Second Frame' }).click())
  await expect(page.getByTestId('track-title')).toHaveText('Second Frame', { timeout: 30_000 })
  // Stock reports the shared file path and is_cue; the title picks the row.
  const current = page.locator('[role=row][aria-current=true]')
  await expect(current).toHaveCount(1)
  await expect(current).toContainText('Second Frame')
  await page.getByTestId('toggle').click()
  await expect(page.getByTestId('toggle')).toHaveAttribute('aria-label', 'Play', { timeout: 30_000 })
  await disconnect(page)
})

test('browses the card folders and creates one through the service on stock', async ({ page }) => {
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/card/files')
  const list = page.getByTestId('files-list')
  await list.getByRole('link', { name: 'Player Acceptance' }).click()
  await list.getByRole('link', { name: 'Lumen - Night Lines' }).click()
  // Stock's transfer browser lists the file; the library names its album.
  const signal = list.getByRole('listitem').filter({ hasText: 'a Signal.flac' })
  await expect(signal.getByRole('link', { name: 'Night Lines' })).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('files-path').getByRole('link', { name: 'Player Acceptance' }).click()
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByRole('textbox', { name: 'Folder name' }).fill('Created Folder')
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  // Confirmed by reading the parent again after stock's reply.
  await expect(page.getByRole('status').filter({ hasText: 'Folder created and found on the card.' })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByTestId('files-path')).toContainText('Created Folder')
  await expect(page.getByTestId('files-empty')).toBeVisible()
  await disconnect(page)
})

test('plays a card folder from the file manager with stock folder play', async ({ page }) => {
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/card/files?folder=Player%20Acceptance')
  const folder = page.getByTestId('files-list').getByRole('listitem').filter({ hasText: 'Lumen - Night Lines' })
  await folder.hover()
  // 0101 with list type 0004 and the folder path: stock starts at its first audio file.
  await verified(page, () => folder.getByRole('button', { name: 'Play Lumen - Night Lines' }).click())
  await expect(page.getByTestId('track-title')).toHaveText('Signal', { timeout: 30_000 })
  await expect(folder).toHaveAttribute('aria-current', 'true')
  await page.getByTestId('toggle').click()
  await expect(page.getByTestId('toggle')).toHaveAttribute('aria-label', 'Play', { timeout: 30_000 })
  await disconnect(page)
})

test('shows the remembered track after the queue ended and continues it with Play on stock', async ({ page }) => {
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/album/Night%20Lines/Lumen')
  await verified(page, () => page.getByRole('button', { name: 'Play Streetlight' }).click())
  // A pause makes stock remember this queue row (MEMORY_PLAY); the last track then plays to its end.
  const toggle = page.getByTestId('toggle')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-label', 'Play', { timeout: 30_000 })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-label', 'Pause', { timeout: 30_000 })
  await page.waitForTimeout(30_000)
  await disconnect(page)
  // Stock now answers no play state; the page shows what it remembers, paused.
  await connectAndPair(page)
  await expect(page.getByTestId('track-title')).toHaveText('Streetlight', { timeout: 30_000 })
  await expect(page.getByTestId('toggle')).toHaveAttribute('aria-label', 'Play')
  await page.getByTestId('toggle').click()
  await expect(page.getByTestId('toggle')).toHaveAttribute('aria-label', 'Pause', { timeout: 30_000 })
  await expect(page.getByTestId('track-title')).toHaveText('Streetlight')
  await page.getByTestId('toggle').click()
  await expect(page.getByTestId('toggle')).toHaveAttribute('aria-label', 'Play', { timeout: 30_000 })
  await disconnect(page)
})

test('measures what takes space on the card through the media route on stock', async ({ page }) => {
  await english(page)
  await page.goto('/#/card')
  // Every library file on the guest card is measured by the MIPS service.
  await expect(page.getByText(/^Measured (\d+) of \1 files$/)).toBeVisible({ timeout: 120_000 })
  await expect(page.getByTestId('card-usage')).toContainText(/used of .+ free/)
  // The generated guest media: FLAC and WAV tones.
  const formats = page.getByTestId('space-formats')
  await expect(formats).toContainText('FLAC')
  await expect(formats).toContainText('WAV')
  await expect(page.getByTestId('space-albums').getByRole('listitem').first()).toContainText(/\d+(\.\d)? [KMG]B$/)
})

test('shows card covers, file durations and both kinds of lyrics on stock', async ({ page }) => {
  const errors = watchErrors(page)
  await english(page)
  await page.goto('/#/albums')
  // Lumen's Harbor has a folder cover.png, Kestrel's a picture embedded in Crossing.
  const harbor = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Harbor' }) })
  for (const artist of ['Lumen', 'Kestrel'])
    await expect(harbor.filter({ hasText: artist }).locator('canvas')).toHaveCount(1, { timeout: 60_000 })
  await page.goto('/#/album/Harbor/Kestrel')
  await expect(page.locator('main canvas').first()).toBeVisible({ timeout: 60_000 })
  // Stock keeps DURATION 0 until a track has played; the files say 0:25.
  await expect(page.getByRole('row')).toHaveCount(2)
  for (const row of await page.getByRole('row').all()) await expect(row).toContainText(/0:2\d/, { timeout: 60_000 })

  await connectAndPair(page)
  await page.goto('/#/album/Night%20Lines/Lumen')
  await verified(page, () => page.getByRole('button', { name: 'Play Signal' }).click())
  const title = page.getByTestId('track-title')
  await expect(title).toHaveText('Signal', { timeout: 30_000 })
  await page.getByRole('button', { name: 'Lyrics' }).filter({ visible: true }).first().click()
  const lyrics = page.getByTestId('lyrics')
  await expect(lyrics.getByRole('button', { name: 'Signal, first line' })).toBeVisible({ timeout: 30_000 })
  await expect(lyrics).toContainText('From the .lrc file beside the track')
  await expect(lyrics.locator('[aria-current=true]')).toHaveCount(1, { timeout: 30_000 })
  await page.getByRole('button', { name: 'Next track' }).first().click()
  await expect(title).toHaveText('Streetlight', { timeout: 30_000 })
  await expect(lyrics).toContainText('Streetlight, embedded line', { timeout: 30_000 })
  await expect(lyrics).toContainText("From the track's tags")
  await page.keyboard.press('Escape')
  await disconnect(page)
  expect(errors.filter((error) => !error.includes('status of 503'))).toEqual([])
})

test('looks lyrics up on LRCLIB and saves them beside the track through the service on stock', async ({ page }) => {
  // LRCLIB's answer is stubbed in the browser; the service's policy (the release's origins)
  // must admit the request, and its upload route writes the .lrc the media route then reads.
  await page.route('https://lrclib.net/api/**', (route) =>
    route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      json: new URL(route.request().url()).pathname.endsWith('/search')
        ? [{ syncedLyrics: '[00:00.00]Crossing, found online\n[00:10.00]Crossing, second line', duration: 25 }]
        : { syncedLyrics: '[00:00.00]Crossing, found online\n[00:10.00]Crossing, second line', duration: 25 },
    }),
  )
  const errors = watchErrors(page)
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/album/Harbor/Kestrel')
  await verified(page, () => page.getByRole('button', { name: 'Play Crossing' }).click())
  await expect(page.getByTestId('track-title')).toHaveText('Crossing', { timeout: 30_000 })
  await page.getByRole('button', { name: 'Lyrics' }).filter({ visible: true }).first().click()
  const panel = page.getByRole('complementary', { name: 'Player view' })
  await panel.getByTestId('lyrics-find').click({ timeout: 30_000 })
  const lyrics = page.getByTestId('lyrics')
  await expect(lyrics).toContainText('Crossing, found online', { timeout: 30_000 })
  await panel.getByTestId('lyrics-save').click()
  await expect(lyrics).toContainText('From the .lrc file beside the track', { timeout: 30_000 })
  await page.reload()
  await page.getByRole('button', { name: 'Lyrics' }).filter({ visible: true }).first().click()
  await expect(page.getByTestId('lyrics')).toContainText('Crossing, found online', { timeout: 30_000 })
  await expect(page.getByTestId('lyrics')).toContainText('From the .lrc file beside the track')
  await page.keyboard.press('Escape')
  await disconnect(page)
  expect(errors.filter((error) => !error.includes('status of 503'))).toEqual([])
})

test('replaces a plain .lrc with synced lyrics from LRCLIB, the old one going to the trash, on stock', async ({
  page,
}) => {
  await page.route('https://lrclib.net/api/**', (route) =>
    route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      json: new URL(route.request().url()).pathname.endsWith('/search')
        ? [{ syncedLyrics: '[00:00.00]Low tide, synced now\n[00:10.00]Low tide, second', duration: 25 }]
        : { syncedLyrics: '[00:00.00]Low tide, synced now\n[00:10.00]Low tide, second', duration: 25 },
    }),
  )
  const errors = watchErrors(page)
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/album/Harbor/Lumen')
  await verified(page, () => page.getByRole('button', { name: 'Play Low Tide' }).click())
  await page.getByRole('button', { name: 'Lyrics' }).filter({ visible: true }).first().click()
  const lyrics = page.getByTestId('lyrics')
  await expect(lyrics).toContainText('Low tide, a plain line', { timeout: 30_000 })
  await page.getByTestId('lyrics-find').click()
  await expect(lyrics).toContainText('Low tide, synced now', { timeout: 30_000 })
  await page.getByTestId('lyrics-save').click()
  await expect(lyrics).toContainText('From the .lrc file beside the track', { timeout: 30_000 })
  await page.reload()
  await page.getByRole('button', { name: 'Lyrics' }).filter({ visible: true }).first().click()
  await expect(page.getByTestId('lyrics')).toContainText('Low tide, synced now', { timeout: 30_000 })
  // The plain file is in the service's trash, restorable.
  await page.keyboard.press('Escape')
  await page.goto('/#/card/trash')
  await expect(page.getByTestId('trash-list')).toContainText('b Low Tide.lrc', { timeout: 30_000 })
  await disconnect(page)
  expect(errors.filter((error) => !error.includes('status of 503'))).toEqual([])
})

test("finds a cover on Cover Art Archive and saves it into the album's folder through the service on stock", async ({
  page,
}) => {
  // MusicBrainz and Cover Art Archive are stubbed in the browser; the service's policy must admit
  // them, its upload route writes cover.png and its media route then serves it for the album.
  const cors = { 'Access-Control-Allow-Origin': '*' }
  await page.route('https://musicbrainz.org/ws/2/**', (route) =>
    route.fulfill({
      headers: cors,
      json: {
        releases: [
          {
            id: 'night-lines',
            score: 100,
            title: 'Night Lines',
            'track-count': 2,
            'artist-credit': [{ name: 'Lumen' }],
          },
        ],
      },
    }),
  )
  await page.route('https://coverartarchive.org/**', (route) =>
    route.fulfill({ headers: cors, contentType: 'image/png', path: 'tests/e2e/fixtures/cover.png' }),
  )
  const errors = watchErrors(page)
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/album/Night%20Lines/Lumen')
  await page.getByTestId('cover-find').click({ timeout: 60_000 })
  await expect(page.getByTestId('cover-offer')).toContainText('Not on the card yet', { timeout: 30_000 })
  await page.getByTestId('cover-save').click()
  await expect(page.getByTestId('cover-offer')).toBeHidden({ timeout: 30_000 })
  await page.reload()
  await expect(page.locator('main canvas').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('cover-find')).toHaveCount(0)
  await disconnect(page)
  expect(errors.filter((error) => !error.includes('status of 503'))).toEqual([])
})

test("finds an artist's photo on Wikimedia Commons within the service's policy", async ({ page }) => {
  // The providers are stubbed in the browser; the service's policy (the release's origins) must admit them.
  const cors = { 'Access-Control-Allow-Origin': '*' }
  await page.route('https://musicbrainz.org/ws/2/**', (route) =>
    route.fulfill({
      headers: cors,
      json:
        new URL(route.request().url()).pathname === '/ws/2/artist/'
          ? { artists: [{ id: 'lumen', name: 'Lumen', score: 100 }] }
          : { relations: [{ type: 'wikidata', url: { resource: 'https://www.wikidata.org/wiki/Q42' } }] },
    }),
  )
  await page.route('https://www.wikidata.org/**', (route) =>
    route.fulfill({
      headers: cors,
      json: { entities: { Q42: { claims: { P18: [{ mainsnak: { datavalue: { value: 'Lumen.jpg' } } }] } } } },
    }),
  )
  await page.route('https://commons.wikimedia.org/**', (route) =>
    route.fulfill({
      headers: cors,
      json: {
        query: {
          pages: {
            '1': {
              imageinfo: [
                {
                  thumburl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/l/lu/Lumen.jpg/500px-Lumen.jpg',
                  extmetadata: { Artist: { value: 'A Photographer' }, LicenseShortName: { value: 'CC BY 4.0' } },
                },
              ],
            },
          },
        },
      },
    }),
  )
  await page.route('https://thumb.wikimedia.org/**', (route) =>
    route.fulfill({ headers: cors, contentType: 'image/png', path: 'tests/e2e/fixtures/cover.png' }),
  )
  const errors = watchErrors(page)
  await english(page)
  await page.goto('/#/artist/Lumen')
  await page.getByTestId('photo-find').click({ timeout: 60_000 })
  await expect(page.getByTestId('photo-credit')).toContainText('A Photographer · CC BY 4.0', { timeout: 30_000 })
  await page.getByTestId('photo-remove').click()
  expect(errors.filter((error) => !error.includes('status of 503'))).toEqual([])
})

test('removes a favorite that is not playing from its row on stock', async ({ page }) => {
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/album/Night%20Lines/Lumen')
  await verified(page, () => page.getByRole('button', { name: 'Play Signal' }).click())
  await expect(page.getByTestId('track-title')).toHaveText('Signal', { timeout: 30_000 })
  const favorite = page
    .getByRole('region', { name: 'Player' })
    .getByRole('button', { name: /^(Favorite|Unfavorite) the current track$/ })
  if ((await favorite.getAttribute('aria-pressed')) !== 'true') await flip(favorite)
  // Only rows that are not playing offer removal.
  await page.getByRole('button', { name: 'Next track' }).first().click()
  await expect(page.getByTestId('track-title')).toHaveText('Streetlight', { timeout: 30_000 })
  await page.goto('/#/favorites')
  await page.getByRole('button', { name: 'Remove from favorites: Signal' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(dialog).toBeHidden({ timeout: 45_000 })
  await expect(page.getByRole('row').filter({ hasText: 'Signal' })).toHaveCount(0, { timeout: 30_000 })
  await disconnect(page)
})

test("pairs with the emulator's all-zero serial number, the only credential", async ({ page }) => {
  await english(page)
  await openConnection(page)
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Serial number', { exact: true }).fill('0000 0000 0000 00')
  await dialog.getByRole('button', { name: 'Pair' }).click()
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(dialog.getByTestId('connection-state')).toContainText('Connected')
  await page.keyboard.press('Escape')
  await page.goto('/#/album/Night%20Lines/Lumen')
  await verified(page, () => page.getByRole('button', { name: 'Play Signal' }).click())
  await disconnect(page)
})

async function trackAction(page: Page, track: string, action: string): Promise<void> {
  await page.getByRole('button', { name: `Track actions: ${track}` }).click()
  await page.getByRole('dialog', { name: 'Track actions' }).getByRole('menuitem', { name: action }).click()
}

test('dislikes tracks on the store, skips one when it starts and a CUE track alone, on stock', async ({ page }) => {
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/album/Harbor/Lumen')
  await expect(page.getByRole('row')).toHaveText([/Harbor Light/, /Low Tide/, /Pier/], { timeout: 30_000 })
  expect(await outcome(page, () => trackAction(page, 'Harbor Light', 'Dislike'))).toBe(
    'Disliked: hidden and skipped from now on.',
  )
  // The album starts with it; the page holds control and skips it with Next.
  await verified(page, () => page.getByRole('button', { name: 'Play album' }).click())
  await expect(page.getByTestId('track-title')).toHaveText('Low Tide', { timeout: 30_000 })
  await page.getByTestId('toggle').click()
  await expect(page.getByTestId('toggle')).toHaveAttribute('aria-label', 'Play', { timeout: 30_000 })
  // A CUE track is disliked by its title: the image's other tracks stay.
  await page.goto('/#/album/Image%20Sessions')
  expect(await outcome(page, () => trackAction(page, 'Second Frame', 'Dislike'))).toBe(
    'Disliked: hidden and skipped from now on.',
  )
  await page.goto('/#/disliked')
  const list = page.getByTestId('disliked-list')
  // The header row first, then the newest dislike.
  await expect(list.getByRole('row')).toHaveText([/Title/, /Second Frame/, /Harbor Light/])
  expect(await outcome(page, () => trackAction(page, 'Second Frame', 'Remove dislike'))).toBe('No longer disliked.')
  expect(await outcome(page, () => trackAction(page, 'Harbor Light', 'Remove dislike'))).toBe('No longer disliked.')
  await expect(page.getByTestId('disliked-empty')).toBeVisible()
  await disconnect(page)
})

test('pins an album and an artist on the store, kept after a reload, on stock', async ({ page }) => {
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/album/Night%20Lines')
  const album = page.getByTestId('pin-album')
  expect(await outcome(page, () => album.click())).toBe('Pinned.')
  await expect(album).toHaveAttribute('aria-pressed', 'true')
  await page.goto('/#/artist/Kestrel')
  const artist = page.getByTestId('pin-artist')
  expect(await outcome(page, () => artist.click())).toBe('Pinned.')
  // Read back from the service's database, not from this browser.
  await page.goto('/#/')
  await page.reload()
  const pinned = page.getByTestId('pinned')
  await expect(pinned.getByRole('link', { name: 'Open Night Lines' })).toBeVisible({ timeout: 30_000 })
  await expect(pinned.getByTestId('pinned-artists').getByRole('link', { name: 'Kestrel' })).toBeVisible()
  await page.goto('/#/album/Night%20Lines')
  expect(await outcome(page, () => album.click())).toBe('Unpinned.')
  await page.goto('/#/artist/Kestrel')
  expect(await outcome(page, () => artist.click())).toBe('Unpinned.')
  await page.goto('/#/')
  await expect(page.getByTestId('pinned')).toHaveCount(0)
  await disconnect(page)
})

test('moves a folder to the trash and back, and macOS leftovers too, on stock', async ({ page }) => {
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/card/files?folder=Player%20Acceptance')
  const row = page.getByTestId('files-list').getByRole('listitem').filter({ hasText: 'Created Folder' })
  await row.hover()
  page.once('dialog', (dialog) => void dialog.accept())
  expect(await outcome(page, () => row.getByRole('button', { name: 'Move to trash: Created Folder' }).click())).toBe(
    'Moved to the trash.',
  )
  await expect(row).toHaveCount(0)
  await page.goto('/#/card/trash')
  const entries = page.getByTestId('trash-list')
  const entry = entries.getByRole('listitem').filter({ hasText: 'Created Folder' })
  await expect(entry).toContainText('From Player Acceptance')
  expect(await outcome(page, () => entry.getByRole('button', { name: 'Restore' }).click())).toBe('Restored.')
  await expect(entry).toHaveCount(0)

  // media.sh left an AppleDouble twin and a .DS_Store.
  const leftovers = page.getByTestId('leftovers')
  await expect(leftovers).toContainText(/\d+ files?, /)
  expect(await outcome(page, () => leftovers.getByRole('button', { name: 'Move to trash' }).click())).toBe(
    'macOS leftovers moved to the trash.',
  )
  await expect(leftovers).toContainText('None on the card.')
  const mac = entries.getByRole('listitem').filter({ hasText: 'macOS leftovers' })
  expect(await outcome(page, () => mac.getByRole('button', { name: 'Restore' }).click())).toBe('Restored.')
  await expect(leftovers).toContainText(/\d+ files?, /)

  await page.goto('/#/card/files?folder=Player%20Acceptance')
  await expect(row).toBeVisible()
  await disconnect(page)
})

test('plays card files in this browser through the audio route, a CUE track from its offset, with the visualizer, on stock', async ({
  page,
}) => {
  const errors = watchErrors(page)
  await english(page)
  await page.goto('/#/album/Night%20Lines')
  await page.getByTestId('album-browser').click()
  const bar = page.getByTestId('browser-player')
  await expect(bar).toContainText('Signal')
  await expect(bar.getByTestId('browser-toggle')).toHaveAttribute('aria-label', 'Pause', { timeout: 30_000 })
  // The position moves: the browser decodes the FLAC from byte ranges of the card file.
  await expect(bar).toContainText(/· 0:0[2-9]/, { timeout: 20_000 })
  // The visualizer's analyser hears the card's FLAC through the same route.
  await bar.getByTestId('visualizer-open').click()
  const visualizer = page.getByRole('dialog', { name: 'Visualizer' })
  await expect(visualizer).toHaveAttribute('data-live', 'true', { timeout: 15_000 })
  await page.keyboard.press('Escape')
  await expect(visualizer).toBeHidden()
  await bar.getByTestId('browser-stop').click()
  await expect(bar).toBeHidden()

  await page.goto('/#/album/Image%20Sessions')
  await trackAction(page, 'Second Frame', 'Play in this browser')
  await expect(bar).toContainText('Second Frame')
  await expect(bar.getByTestId('browser-toggle')).toHaveAttribute('aria-label', 'Pause', { timeout: 30_000 })
  // Counted from the track's start at 0:20 in the image, not from the file's.
  await expect(bar).toContainText(/· 0:0[1-9]/, { timeout: 20_000 })
  await bar.getByTestId('browser-stop').click()
  await expect(bar).toBeHidden()
  expect(errors).toEqual([])
})

test('pauses stock when playback starts in this browser', async ({ page }) => {
  const errors = watchErrors(page)
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/album/Harbor/Kestrel')
  await verified(page, () => page.getByRole('button', { name: 'Play album' }).click())
  const toggle = page.getByTestId('toggle')
  await expect(toggle).toHaveAttribute('aria-label', 'Pause', { timeout: 30_000 })
  await page.getByTestId('album-browser').click()
  await expect(page.getByTestId('browser-toggle')).toHaveAttribute('aria-label', 'Pause', { timeout: 30_000 })
  // Stock pauses: a guarded toggle, sent only while it played, confirmed by its own state.
  await expect(toggle).toHaveAttribute('aria-label', 'Play', { timeout: 30_000 })
  await page.getByTestId('browser-stop').click()
  await disconnect(page)
  expect(errors.filter((error) => !error.includes('status of 503'))).toEqual([])
})

test("shows the running service's diagnostics on stock", async ({ page }) => {
  await english(page)
  await openConnection(page)
  const diagnostics = page.getByRole('dialog').getByTestId('diagnostics')
  await diagnostics.getByText('Diagnostics', { exact: true }).click()
  await expect(diagnostics).toContainText(/0\.9\.0 · build [0-9a-f]{12}/, { timeout: 15_000 })
  // The app installed into Apps/Disc Player names its version (combined-009).
  await expect(diagnostics).toContainText(/from the card · \d{4}\.\d{2}\.\d{2}-[0-9a-f]{7}/)
  await expect(diagnostics).toContainText(/ok, schema 5/)
  await page.keyboard.press('Escape')
})

test('uploads a file, scans once and shows it in New on stock', async ({ page }) => {
  await english(page)
  await connectAndPair(page)
  const name = `Player Acceptance Upload ${String(Date.now() % 100_000)}`
  await page.getByRole('button', { name: 'Add music' }).click()
  const dialog = page.getByRole('dialog')
  await dialog
    .locator('input[type=file]:not([webkitdirectory])')
    .setInputFiles([{ name: `${name}.wav`, mimeType: 'audio/wav', buffer: wav(2) }])
  await dialog.getByRole('button', { name: 'Transfer to DISC' }).click()
  await expect(dialog.getByTestId('import-flow')).toHaveText(/confirmed files are on the card/, { timeout: 60_000 })
  await dialog.getByRole('button', { name: 'Start scan' }).click()
  await expect(dialog.getByTestId('scan-status')).toContainText('Scan ended', { timeout: 120_000 })
  await expect(dialog.getByTestId('import-flow')).toHaveText(/collection is up to date/, { timeout: 60_000 })
  await dialog.getByRole('button', { name: 'Open New' }).click()
  await expect(page.getByRole('button', { name: new RegExp(`^Play ${name}`) })).toBeVisible({ timeout: 30_000 })
  await disconnect(page)
})

// Leave the guest as prepare_guest.py does: the CI album selected and paused,
// so the shared browser tests find a current track.
test.afterAll(async ({ browser }, info) => {
  if (!enabled || info.project.name !== 'desktop') return
  const page = await browser.newPage({ baseURL: process.env.E2E_BASE_URL })
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/album/CI%20Album')
  await verified(page, () => page.getByRole('button', { name: 'Play album' }).click())
  await page.getByTestId('toggle').click()
  await expect(page.getByTestId('toggle')).toHaveAttribute('aria-label', 'Play', { timeout: 30_000 })
  await disconnect(page)
  await page.close()
})

/** A short silent 16-bit stereo WAV. */
function wav(seconds: number): Buffer {
  const rate = 44_100
  const data = rate * seconds * 4
  const buffer = Buffer.alloc(44 + data)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + data, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(2, 22)
  buffer.writeUInt32LE(rate, 24)
  buffer.writeUInt32LE(rate * 4, 28)
  buffer.writeUInt16LE(4, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(data, 40)
  return buffer
}
