/**
 * The service's own features on the mock gateway (combined-008): disliked
 * tracks and pins on the store, the trash with macOS leftovers, playback in
 * the browser and the diagnostics disclosure. Each test leaves the shared
 * mock as it found it, so both projects run against the same server.
 */
import { expect, test, type Page } from '@playwright/test'
import {
  connectAndPair,
  disconnect,
  english,
  external,
  openConnection,
  SERIAL,
  switchSide,
  watchErrors,
} from './helpers'

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

/** Paired, then the bar's switch to this browser; what the player played comes along. */
async function toBrowser(page: Page): Promise<void> {
  await connectAndPair(page)
  await switchSide(page, 'browser')
}

const toDisc = (page: Page) => switchSide(page, 'disc')

test('plays in this browser once the switch says so: a track from its menu, an album in order', async ({ page }) => {
  const errors = watchErrors(page)
  await english(page)
  await toBrowser(page)
  await page.goto('/#/album/Blue%20Hours/Mira%20Sol')
  await page.getByRole('button', { name: 'Track actions: Window Seat' }).click()
  await page.getByRole('dialog', { name: 'Track actions' }).getByRole('menuitem', { name: 'Play', exact: true }).click()
  const title = page.getByTestId('track-title')
  await expect(title).toHaveText('Window Seat')
  const toggle = page.getByTestId('toggle')
  await expect(toggle).toHaveAttribute('aria-label', 'Pause', { timeout: 10_000 })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-label', 'Play')
  // A whole album plays in order, one track after another.
  await page.getByRole('button', { name: 'Play album' }).click()
  await expect(toggle).toHaveAttribute('aria-label', 'Pause', { timeout: 10_000 })
  const first = (await title.textContent()) ?? ''
  await page.getByRole('region', { name: 'Player' }).getByRole('button', { name: 'Next track' }).click()
  await expect(title).not.toHaveText(first)
  // No "play in this browser" entries any more: the switch is the one place.
  await page.getByRole('button', { name: 'Track actions: Window Seat' }).click()
  await expect(page.getByRole('dialog', { name: 'Track actions' })).not.toContainText('in this browser')
  await page.keyboard.press('Escape')
  await toDisc(page)
  await disconnect(page)
  expect(errors).toEqual([])
})

test('draws what plays in this browser as the disc visualizer', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'The visualizer button is in the desktop bar')
  const errors = watchErrors(page)
  await english(page)
  await toBrowser(page)
  await page.goto('/#/album/Blue%20Hours/Mira%20Sol')
  await page.getByRole('button', { name: 'Play album' }).click()
  const bar = page.getByRole('region', { name: 'Player' })
  await expect(bar.getByTestId('toggle')).toHaveAttribute('aria-label', 'Pause', { timeout: 10_000 })
  // The player's sound settings stay in place, disabled: this browser's sound has none of them.
  await expect(bar.getByTestId('sound-open')).toBeDisabled()
  await bar.getByTestId('visualizer-open').click()
  const visualizer = page.getByRole('dialog', { name: 'Visualizer' })
  await expect(visualizer).toBeVisible()
  await expect(visualizer).toContainText(await bar.getByTestId('track-title').innerText())
  // The analyser hears the mock's tones and the canvas fills the screen.
  await expect(visualizer).toHaveAttribute('data-live', 'true', { timeout: 10_000 })
  // The whole window: the page behind drops its scrollbar gutter, so classic scrollbars (Linux, Windows)
  // leave no strip at the right edge.
  const box = await page.getByTestId('visualizer-canvas').boundingBox()
  expect(box?.width).toBe(page.viewportSize()?.width)
  await expect(page.locator('html')).toHaveClass(/overlay-open/)
  // Space pauses this browser's playback, not the player's.
  await page.keyboard.press('Space')
  await expect(visualizer.getByTestId('visualizer-toggle')).toHaveAttribute('aria-label', 'Play')
  await visualizer.getByTestId('visualizer-toggle').click()
  await expect(visualizer.getByTestId('visualizer-toggle')).toHaveAttribute('aria-label', 'Pause')
  // Previous and Next are always drawn (owner, 2026-09-30); the arrows do the same.
  const title = bar.getByTestId('track-title')
  const first = await title.innerText()
  await expect(visualizer.getByTestId('visualizer-previous')).toBeEnabled()
  await visualizer.getByTestId('visualizer-next').click()
  await expect(title).not.toHaveText(first)
  await page.keyboard.press('ArrowLeft')
  await expect(title).toHaveText(first)
  await page.keyboard.press('ArrowRight')
  await expect(title).not.toHaveText(first)
  await visualizer.getByTestId('visualizer-previous').click()
  await expect(title).toHaveText(first)
  await page.keyboard.press('Escape')
  await expect(visualizer).toBeHidden()
  await expect(page.locator('html')).not.toHaveClass(/overlay-open/)
  // V opens it again; on the player's side there is nothing to draw.
  await page.keyboard.press('v')
  await expect(visualizer).toBeVisible()
  await page.keyboard.press('v')
  await expect(visualizer).toBeHidden()
  await toDisc(page)
  await expect(bar.getByTestId('visualizer-open')).toHaveCount(0)
  await expect(bar.getByTestId('sound-open')).toBeEnabled()
  await page.keyboard.press('v')
  await expect(visualizer).toBeHidden()
  await disconnect(page)
  expect(errors).toEqual([])
})

test("shows the service's diagnostics in the connection dialog", async ({ page }) => {
  await english(page)
  await openConnection(page)
  const diagnostics = page.getByRole('dialog').getByTestId('diagnostics')
  await diagnostics.getByText('Diagnostics', { exact: true }).click()
  await expect(diagnostics).toContainText('0.9.0 · build mock')
  await expect(diagnostics).toContainText('usb-engineering · 2.57')
  await expect(diagnostics).toContainText('from the card · 2026.09.29')
  await expect(diagnostics).toContainText('ok, schema 5')
  await expect(diagnostics.getByTestId('about-writes')).toHaveText('every play written')
  await expect(diagnostics).toContainText('restarted after signal 11')
  await expect(diagnostics).toContainText('Skip rule: skipped to the next track')
  await page.keyboard.press('Escape')
})

test('says when the service cannot write plays, and why', async ({ page, request }) => {
  test.skip(external, 'Needs the mock gateway')
  await request.post('/__mock/history-failing?on=1')
  try {
    await english(page)
    // Home says it where Recently played stands still.
    await expect(page.getByTestId('history-failing')).toContainText('not recording plays right now')
    await openConnection(page)
    const diagnostics = page.getByRole('dialog').getByTestId('diagnostics')
    await diagnostics.getByText('Diagnostics', { exact: true }).click()
    await expect(diagnostics.getByTestId('about-writes')).toHaveText('2 plays not written: the card is full')
    await page.keyboard.press('Escape')
  } finally {
    await request.post('/__mock/history-failing?on=0')
  }
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Recently played' })).toBeVisible()
  await expect(page.getByTestId('history-failing')).toBeHidden()
})

test('puts a play in this browser into the play history with its album', async ({ page, request }) => {
  test.skip(external, 'Needs the mock gateway')
  test.setTimeout(60_000)
  const errors = watchErrors(page)
  const plays = async () => (await (await request.get('/__mock/browser-plays')).json()) as Record<string, unknown>[]
  const before = (await plays()).length
  try {
    await reportedPlay(page, plays, before)
  } finally {
    await request.delete('/__mock/browser-plays')
  }
  expect(errors).toEqual([])
})

async function reportedPlay(page: Page, plays: () => Promise<Record<string, unknown>[]>, before: number) {
  await english(page)
  // The report needs the serial number, as every change does.
  await toBrowser(page)
  await page.goto('/#/album/Blue%20Hours/Mira%20Sol')
  await page.getByRole('button', { name: 'Play album' }).click()
  await expect(page.getByTestId('toggle')).toHaveAttribute('aria-label', 'Pause', { timeout: 10_000 })
  // Half of the mock's 30-second file is a play: one report, as the observer would record it.
  await expect.poll(async () => (await plays()).length, { timeout: 30_000 }).toBe(before + 1)
  const play = (await plays()).at(-1) as { path: string; seconds: number; title?: string; ctx: Record<string, unknown> }
  expect(play.path).toMatch(/^\/tmp\/sdcard\//)
  expect(play.seconds).toBeGreaterThanOrEqual(15)
  expect(play.title).toBeUndefined()
  expect(play.ctx).toMatchObject({ type: 3, album: 'Blue Hours', artist: 'Mira Sol', genre: null, folder: null })
  expect(play.ctx.hash).toMatch(/^[0-9a-f]{16}$/)
  await toDisc(page)
  // Recently played names the album first.
  await page.goto('/#/')
  const recent = page.getByRole('list', { name: 'Recently played' })
  await expect(recent.getByRole('listitem').first()).toContainText('Blue Hours')
  await disconnect(page)
}

test('keeps automatic playlists on the player: an artist’s most played and the Playlists page’s lists', async ({
  page,
  request,
}, info) => {
  test.setTimeout(90_000)
  const errors = watchErrors(page)
  const lists = async () =>
    ((await (await request.get('/api/lists/external')).json()) as { lists: { name: string }[] }).lists.map(
      (list) => list.name,
    )
  try {
    await english(page)
    await connectAndPair(page)
    // From the artist page: the artist's most played, kept by the player.
    await page.goto('/#/artist/Forma')
    const keep = page.getByTestId('artist-auto')
    await expect(keep).toHaveText('Keep on the player')
    await keep.click()
    await expect(status(page, '“Most played · Forma” is on the player')).toBeVisible()
    await expect(keep).toHaveText('On the player')
    await expect(keep).toHaveAttribute('aria-pressed', 'true')
    expect(await lists()).toEqual(['Most played · Forma'])

    // The Playlists page adds the other lists; one with nothing to hold yet is not made.
    await page.goto('/#/playlists')
    const section = page.getByTestId('auto-playlists')
    const row = (kind: string) => section.locator(`li[data-kind="${kind}"]`)
    await row('most_played').getByRole('button', { name: 'Add to the player' }).click()
    await expect(row('most_played')).toContainText(/Most played\s*\d+ tracks?/)
    // A list on the player says how it is kept and the day it was drawn; one not added opens as a preview, as from Home.
    await expect(row('most_played')).toContainText(/updated daily · [A-Z][a-z]{2} \d{1,2}/)
    await row('daily_mix').getByRole('link', { name: 'Daily mix' }).click()
    await expect(page).toHaveURL(/#\/list\/Daily%20mix\?kind=daily_mix$/)
    await expect(page.getByRole('table').getByRole('row').nth(1)).toBeVisible()
    await page.goto('/#/playlists')
    // A list with nothing to hold yet cannot be added.
    await expect(row('not_played_lately')).toContainText('0 tracks')
    await expect(row('not_played_lately').getByRole('button', { name: 'Add to the player' })).toBeDisabled()
    // Its page: how often it changes (kept in the store) and drawing it again now, behind "⋯".
    await row('most_played').getByRole('link', { name: 'Most played', exact: true }).click()
    await expect(page.getByRole('main')).toContainText(/updated [A-Z][a-z]{2} \d{1,2}/)
    await page.getByTestId('list-actions').click()
    await expect(page.getByRole('menuitemradio', { name: 'Every day' })).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('menuitemradio', { name: 'Every week' }).click()
    await expect
      .poll(async () => {
        const doc = (await (await request.get('/api/store/auto_playlists/records')).json()) as {
          records: { value: { name: string; period?: string; written?: string } }[]
        }
        return doc.records.find((record) => record.value.name === 'Most played')?.value.period
      })
      .toBe('week')
    await page.getByTestId('list-actions').click()
    await page.getByRole('menuitem', { name: 'Update now' }).click()
    await expect(status(page, 'Automatic playlists are up to date')).toBeVisible()
    await page.goto('/#/playlists')
    await expect(row('most_played')).toContainText('updated weekly')
    await expect(row('artist_most_played')).toContainText('Most played · Forma')
    expect(await lists()).toEqual(['Most played', 'Most played · Forma'])

    // Nothing changed since: an update writes nothing.
    await section.getByTestId('auto-refresh').click()
    await expect(status(page, 'Automatic playlists are up to date')).toBeVisible()

    // A list plays on the player from its first entry, confirmed by the playing file.
    const first = (
      (await (await request.get(`/api/lists/external/${encodeURIComponent('Most played · Forma')}`)).json()) as {
        entries: string[]
      }
    ).entries[0]
    await row('artist_most_played').getByRole('button', { name: 'Play Most played · Forma' }).click()
    await expect(status(page, 'Done. Verified on DISC.')).toBeVisible({ timeout: 15_000 })
    // Stock reports a list's play as a folder play naming the list: the bar names the list and opens its page.
    const from = page
      .getByRole('region', { name: 'Player' })
      .getByRole('link', { name: 'Playlist: Most played · Forma' })
    if (info.project.name === 'desktop') await expect(from).toBeVisible()
    // The mock names files "<number> <title>.flac".
    const file = first.split('/').at(-1) ?? ''
    const title = file.replace(/^\d+\s*/, '').replace(/\.[a-z0-9]+$/, '')
    await expect(page.getByTestId('track-title')).toContainText(title.slice(0, 5))

    // Home: made for you. The daily mix is not on the player yet and looks the same: listening writes it
    // there first and plays it, one tap (owner, 2026-09-30).
    await expect(status(page, 'Done. Verified on DISC.')).toBeHidden({ timeout: 10_000 })
    await page.goto('/#/')
    const mix = page.getByTestId('for-you').locator('article[data-kind="daily_mix"]')
    if (info.project.name === 'phone') {
      // Touch screens have no hover button: the card opens the list, which plays from there.
      await mix.getByRole('link', { name: 'Open Daily mix' }).click()
      await page.getByTestId('list-play').click()
    } else {
      await mix.hover()
      await mix.getByRole('button', { name: 'Play Daily mix' }).click()
    }
    await expect(status(page, 'Done. Verified on DISC.')).toBeVisible({ timeout: 15_000 })
    expect(await lists()).toContain('Daily mix')
    // Not made yet, from its page: its tracks first, Listen writes and plays it, and the page becomes its own.
    await page.goto(`/#/list/${encodeURIComponent('Recently added')}?kind=recently_added`)
    await expect(page.getByRole('table').getByRole('row').nth(1)).toBeVisible()
    await page.getByTestId('list-play').click()
    await expect(status(page, 'Done. Verified on DISC.')).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(/#\/list\/Recently%20added$/)

    await page.goto('/#/playlists')
    // Removed after a confirmation: the file and the record go.
    page.once('dialog', (dialog) => void dialog.accept())
    await row('recently_added').getByRole('button', { name: 'More actions: Recently added' }).click()
    await page.getByRole('menuitem', { name: 'Remove from the player' }).click()
    await expect(status(page, '“Recently added” is removed from the player')).toBeVisible()
    await expect(row('recently_added').getByRole('button', { name: 'Add to the player' })).toBeVisible()
    expect(await lists()).toEqual(['Daily mix', 'Most played', 'Most played · Forma'])
    await disconnect(page)
  } finally {
    await request.delete('/__mock/lists')
  }
  expect(errors).toEqual([])
})

test('makes an automatic playlist with a card catalog from before the rotation periods', async ({ page, request }) => {
  await request.post('/__mock/store-old?on=1')
  try {
    await english(page)
    await connectAndPair(page)
    await page.goto('/#/artist/Forma')
    await page.getByTestId('artist-auto').click()
    await expect(status(page, '“Most played · Forma” is on the player')).toBeVisible()
    const doc = (await (await request.get('/api/store/auto_playlists/records')).json()) as {
      records: { value: Record<string, unknown> }[]
    }
    // Stored without the fields the older catalog refuses: nothing was written by the refused attempt.
    expect(doc.records.map((record) => record.value)).toEqual([
      { name: 'Most played · Forma', kind: 'artist_most_played', artist: 'Forma', at: expect.any(Number) as unknown },
    ])
    await disconnect(page)
  } finally {
    await request.post('/__mock/store-old?on=0')
    await request.delete('/__mock/lists')
  }
})
