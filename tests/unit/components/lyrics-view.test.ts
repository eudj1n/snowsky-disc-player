// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import LyricsView from '../../../src/components/player/LyricsView.vue'
import { parseLyrics } from '../../../src/domain/lyrics'

const text = Array.from({ length: 40 }, (_, i) => `[00:${String(i).padStart(2, '0')}.00]Line ${i + 1}`).join('\n')

afterEach(() => vi.restoreAllMocks())

describe('LyricsView', () => {
  it('opens at the current line, also while paused', async () => {
    const scrolled: (string | null)[] = []
    vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(function (this: HTMLElement) {
      scrolled.push(this.getAttribute('data-line'))
    })
    mount(LyricsView, {
      props: {
        lyrics: parseLyrics(text),
        positionMs: 25_500,
        positionAt: null,
        playing: false,
        message: null,
        source: null,
        seekLabel: 'Go to this line',
        seekable: true,
      },
    })
    await nextTick()
    await nextTick()
    expect(scrolled).toEqual(['25'])
  })
})
