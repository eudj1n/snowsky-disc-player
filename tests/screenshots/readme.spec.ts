/**
 * The README's pictures, taken from the mock gateway's fictional collection with the reference demo's original
 * covers (fixtures/demo-covers). Each picture is written to docs/images (SCREENSHOTS_DIR overrides it).
 */
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { chooseSources, connectAndPair, english } from '../e2e/helpers'
import { COVERS } from './playwright.config'

const OUT = process.env.SCREENSHOTS_DIR ?? 'docs/images'
const SOURCES = 'tests/e2e/fixtures/demo-covers'

test.beforeAll(async ({ browser }) => {
  mkdirSync(COVERS, { recursive: true })
  mkdirSync(OUT, { recursive: true })
  // Drawn the same for every project: one CSS pixel a pixel, no phone viewport.
  const page = await browser.newPage({
    viewport: { width: 600, height: 600 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  })
  for (const name of readdirSync(SOURCES).filter((file) => file.endsWith('.svg'))) {
    const svg = readFileSync(`${SOURCES}/${name}`, 'utf8').replace('<svg ', '<svg width="600" height="600" ')
    await page.setContent(`<body style="margin:0">${svg}</body>`)
    await page.screenshot({
      path: `${COVERS}/${name.replace('.svg', '.png')}`,
      clip: { x: 0, y: 0, width: 600, height: 600 },
    })
  }
  await page.close()
})

async function shoot(page: Page, name: string): Promise<void> {
  // Covers and colours settle, the progress bar moves on; no focus ring is left from a closed sheet.
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
  await page.waitForTimeout(1200)
  // JPEG: the covers' grain makes PNGs several times larger, with nothing to see for it.
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 90 })
}

async function play(page: Page, album: string, track: string): Promise<void> {
  await page.goto(`/#/album/${album}`)
  await page
    .getByRole('button', { name: `Play ${track}` })
    .first()
    .click()
  await expect(page.getByTestId('track-title').filter({ visible: true }).first()).toHaveText(track, { timeout: 15_000 })
}

test('desktop pictures', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop')
  await english(page)
  await connectAndPair(page)
  await play(page, 'Afterglow/Northline', 'Soft Focus')
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await shoot(page, 'readme-home')
  await page.goto('/#/albums')
  await shoot(page, 'readme-albums')
  // Search as you type.
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByTestId('search-palette').getByRole('combobox').fill('sun')
  await shoot(page, 'readme-search')
  await page.keyboard.press('Escape')
  // The album, its colours and the synced lyrics beside it.
  await page.emulateMedia({ colorScheme: 'dark' })
  await play(page, 'Inner%20Space/Forma', 'Still Here')
  await page.getByRole('button', { name: 'Lyrics' }).filter({ visible: true }).first().click()
  await expect(page.getByTestId('lyrics').locator('[aria-current=true]')).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(2500)
  await shoot(page, 'readme-lyrics')
  await page.getByRole('complementary', { name: 'Player view' }).getByTestId('karaoke-open').click()
  await expect(page.getByTestId('karaoke').locator('[aria-current=true]')).toHaveText('Counting the lights outside', {
    timeout: 15_000,
  })
  await page.waitForTimeout(600)
  await shoot(page, 'readme-karaoke')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/#/card')
  await expect(page.getByTestId('card-usage')).toBeVisible({ timeout: 15_000 })
  await shoot(page, 'readme-card')
})

test('an album beside its editions', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop')
  const cors = { 'Access-Control-Allow-Origin': '*' }
  const edition = (n: number, tracks: number, country: string, format: string, date: string) => ({
    id: `8b1d2c3b-0000-4000-8000-00000000e00${String(n)}`,
    score: 90,
    title: n === 3 ? 'Night Drive (Deluxe)' : 'Night Drive',
    date,
    country,
    'track-count': tracks,
    media: [{ format }],
    'label-info': [{ label: { name: 'Lumen Records' }, 'catalog-number': `LR-0${String(n)}` }],
    'artist-credit': [{ name: 'Northline' }],
    'release-group': { id: '8b1d2c3b-0000-4000-8000-00000000c009', 'primary-type': 'Album' },
  })
  await page.route('https://musicbrainz.org/ws/2/**', async (route) => {
    const url = new URL(route.request().url())
    const tracks = url.pathname.endsWith('e001')
      ? [
          ['Night Drive', 243_500],
          ['City Glow', 176_400],
          ['Last Exit (Extended Mix)', 341_000],
          ['Afterhours', 225_000],
        ]
      : [
          ['Night Drive', 243_500],
          ['City Glow', 176_400],
          ['Last Exit', 229_900],
        ]
    await route.fulfill({
      headers: cors,
      json: /^\/ws\/2\/release\/[0-9a-f-]+$/.test(url.pathname)
        ? {
            media: [
              { position: 1, tracks: tracks.map(([title, length], i) => ({ number: String(i + 1), title, length })) },
            ],
          }
        : url.pathname === '/ws/2/artist/'
          ? { artists: [] }
          : {
              releases: url.searchParams.get('query')?.includes('Night Drive')
                ? [
                    edition(2, 3, 'JP', 'Vinyl', '2010'),
                    edition(1, 4, 'GB', 'CD', '2004-05-10'),
                    edition(3, 12, 'US', '2×CD', '2014-09-01'),
                    edition(4, 3, 'DE', 'Digital Media', '2019'),
                  ]
                : [],
            },
    })
  })
  await chooseSources(page, { musicbrainz: { allowed: true } })
  await english(page)
  await connectAndPair(page)
  await page.goto('/#/album/Night%20Drive/Northline')
  await page.getByTestId('info-open').click()
  await page
    .getByTestId('info-panel')
    .getByRole('button', { name: /Choose the edition|Identify on MusicBrainz/ })
    .first()
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByTestId('identify-choices').getByRole('button').first().click()
  await expect(dialog.getByTestId('compare-proposed-tracks').getByRole('listitem')).toHaveCount(3, { timeout: 15_000 })
  await shoot(page, 'readme-editions')
  await page.keyboard.press('Escape')
  await chooseSources(page)
})

test('phone pictures', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone')
  await english(page)
  await connectAndPair(page)
  await play(page, 'Blue%20Hours/Mira%20Sol', 'Window Seat')
  await page.goto('/')
  await shoot(page, 'readme-phone-home')
  await page.getByRole('button', { name: 'Open Now Playing panel' }).first().click()
  await expect(page.getByRole('complementary', { name: 'Player view' })).toBeVisible()
  await shoot(page, 'readme-phone-player')
  await page.keyboard.press('Escape')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/#/album/Velvet%20Season/June%20%26%20the%20City')
  await shoot(page, 'readme-phone-album')
})
