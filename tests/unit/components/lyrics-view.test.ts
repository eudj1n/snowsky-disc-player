// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import LyricsView from '../../../src/components/player/LyricsView.vue'
import { parseLyrics } from '../../../src/domain/lyrics'

const text = Array.from({ length: 40 }, (_, i) => `[00:${String(i).padStart(2, '0')}.00]Line ${i + 1}`).join('\n')
const rect = (top: number, bottom: number) => ({ top, bottom, height: bottom - top }) as DOMRect

let clock = 100_000
/** Where the sheet was asked to scroll. */
let scrolled: number[] = []
/** The sheet's scroll position: it is 500 high, the lyrics start at 400 in it and line n at 450 + 40n. */
let sheetTop = 0

beforeEach(() => {
  clock = 100_000
  scrolled = []
  sheetTop = 0
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.scroller) return rect(0, 500)
    if (this.dataset.line === undefined) return rect(400 - sheetTop, 2100 - sheetTop)
    const top = 450 + 40 * Number(this.dataset.line) - sheetTop
    return rect(top, top + 40)
  })
})
afterEach(() => vi.restoreAllMocks())

async function settle(): Promise<void> {
  await nextTick()
  await nextTick()
}

function mountLyrics(positionMs: number) {
  const scroller = document.createElement('div')
  scroller.dataset.scroller = 'true'
  Object.defineProperty(scroller, 'scrollTop', { get: () => sheetTop })
  scroller.scrollTo = ((options: ScrollToOptions) => {
    sheetTop = options.top ?? sheetTop
    scrolled.push(sheetTop)
  }) as typeof scroller.scrollTo
  const view = mount(LyricsView, {
    props: {
      lyrics: parseLyrics(text),
      positionMs,
      positionAt: null,
      playing: false,
      message: null,
      source: null,
      seekLabel: 'Go to this line',
      seekable: true,
      scroller,
      covered: 60,
    },
  })
  const follow = (view.vm as unknown as { follow: (smooth: boolean) => void }).follow
  /** The listener scrolls the sheet to a position. */
  const scrollBy = (top: number) => {
    scroller.dispatchEvent(new Event('wheel'))
    sheetTop = top
    scroller.dispatchEvent(new Event('scroll'))
  }
  return { view, follow, scrollBy }
}

describe('LyricsView', () => {
  it('leaves the Now sheet at its head until the lyrics are asked for', async () => {
    const { view } = mountLyrics(25_500)
    await settle()
    await view.setProps({ positionMs: 26_500 })
    await settle()
    expect(scrolled).toEqual([])
  })

  it('shows the current line when asked, also while paused, and follows it from then on', async () => {
    const { view, follow } = mountLyrics(25_500)
    follow(false)
    await settle()
    // Line 25 (at 1450) in the middle of the sheet.
    expect(scrolled).toEqual([1220])
    clock += 5_000
    await view.setProps({ positionMs: 26_500 })
    await settle()
    expect(scrolled).toEqual([1220, 1260])
  })

  it('shows the current line once the sheet reaches lyrics asked for before it', async () => {
    const { view, follow } = mountLyrics(25_500)
    const scroller = view.props('scroller')
    await view.setProps({ scroller: null })
    follow(false)
    await settle()
    expect(scrolled).toEqual([])
    await view.setProps({ scroller })
    await settle()
    expect(scrolled).toEqual([1220])
  })

  it('keeps the head folded away above the first lines', async () => {
    const { follow } = mountLyrics(500)
    follow(false)
    await settle()
    // Line 0 would sit in the middle at 220; the lyrics' start goes below the pinned line instead.
    expect(scrolled).toEqual([328])
  })

  it('waits after a scroll by hand until the current line is back in view', async () => {
    const { view, follow, scrollBy } = mountLyrics(25_500)
    follow(false)
    await settle()
    clock += 5_000
    scrollBy(0)
    clock += 5_000
    await view.setProps({ positionMs: 26_500 })
    await settle()
    expect(scrolled).toEqual([1220])

    scrollBy(1200)
    clock += 5_000
    await view.setProps({ positionMs: 27_500 })
    await settle()
    expect(scrolled).toEqual([1220, 1300])
  })

  it('does not take the sheet from a listener who is scrolling', async () => {
    const { view, follow, scrollBy } = mountLyrics(25_500)
    follow(false)
    await settle()
    clock += 5_000
    scrollBy(1240)
    clock += 500
    await view.setProps({ positionMs: 26_500 })
    await settle()
    expect(scrolled).toEqual([1220])
  })
})
