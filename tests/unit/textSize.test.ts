// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { isTextSize, TEXT_SIZES } from '../../src/domain/preferences'
import { chooseTextSize, TEXT_SIZE_KEY, textSize } from '../../src/stores/appearance'

describe('text size', () => {
  it('knows its four steps and nothing else', () => {
    expect(TEXT_SIZES).toEqual(['compact', 'standard', 'large', 'extra-large'])
    expect(TEXT_SIZES.every(isTextSize)).toBe(true)
    expect(isTextSize('huge')).toBe(false)
    expect(isTextSize(null)).toBe(false)
  })

  it('marks the document for a chosen step and leaves Standard unmarked and unsaved', async () => {
    expect(textSize.value).toBe('standard')
    chooseTextSize('extra-large')
    await nextTick()
    expect(document.documentElement.dataset.textSize).toBe('extra-large')
    expect(localStorage.getItem(TEXT_SIZE_KEY)).toBe('extra-large')
    chooseTextSize('standard')
    await nextTick()
    expect(document.documentElement.dataset.textSize).toBeUndefined()
    expect(localStorage.getItem(TEXT_SIZE_KEY)).toBeNull()
  })
})
