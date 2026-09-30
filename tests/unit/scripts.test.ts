// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { isolateName, scriptLanguage } from '../../src/domain/scripts'
import { trackCredits } from '../../src/domain/track'
import { t } from '../../src/i18n'
import { followScriptLanguages } from '../../src/lib/scriptLanguages'

describe('names in any script', () => {
  it('isolate a name with a right-to-left letter and leave others as they are', () => {
    expect(isolateName('فيروز')).toBe('⁨فيروز⁩')
    expect(isolateName('עומר אדם')).toBe('⁨עומר אדם⁩')
    expect(isolateName('Björk')).toBe('Björk')
    expect(isolateName('Земфира')).toBe('Земфира')
    expect(trackCredits({ artist: 'فيروز', album: 'Live 1991' })).toBe('⁨فيروز⁩ · Live 1991')
    expect(trackCredits({ artist: 'Lumen', album: 'Afterglow' })).toBe('Lumen · Afterglow')
  })

  it('keep names in messages apart from the message text, numbers as they are', () => {
    expect(t('auto_made', { name: 'فيروز' })).toBe('“\u2068فيروز\u2069” is on the player')
    expect(t('auto_made', { name: 'Lumen' })).toBe('“Lumen” is on the player')
    expect(t('track_count', { count: 12 })).toBe('12 tracks')
  })

  it('tell Japanese by kana and Korean by hangul, and leave ideographs alone to the document', () => {
    expect(scriptLanguage('宇多田ヒカル')).toBe('ja')
    expect(scriptLanguage('あいみょん')).toBe('ja')
    expect(scriptLanguage('ｶﾀｶﾅ')).toBe('ja')
    expect(scriptLanguage('아이유')).toBe('ko')
    expect(scriptLanguage('周杰伦')).toBeNull()
    expect(scriptLanguage('First Love')).toBeNull()
  })
})

describe('the document follows the scripts of its names', () => {
  let observer: MutationObserver | null = null
  afterEach(() => {
    observer?.disconnect()
    document.body.innerHTML = ''
  })
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('marks elements whose own text is Japanese or Korean, and clears the mark when it changes', async () => {
    document.body.innerHTML = '<p><span id="a">宇多田ヒカル</span> · <span id="b">Lumen</span></p><i lang="zh">あ</i>'
    observer = followScriptLanguages(document.body)
    const a = document.getElementById('a') as HTMLElement
    expect(a.lang).toBe('ja')
    expect(document.getElementById('b')?.hasAttribute('lang')).toBe(false)
    // A template's own language stays.
    expect(document.querySelector('i')?.lang).toBe('zh')

    const text = a.firstChild as Text
    text.nodeValue = 'First Love'
    await settle()
    expect(a.hasAttribute('lang')).toBe(false)

    const added = document.createElement('strong')
    added.textContent = '아이유'
    document.body.append(added)
    await settle()
    expect(added.lang).toBe('ko')
  })
})
