/**
 * Gives elements whose own text is Japanese or Korean that language, so the
 * browser picks Japanese or Korean glyph forms for their ideographs whatever
 * the interface language (src/domain/scripts.ts). One observer for the whole
 * document keeps every view, dialog and future component covered; it touches
 * only elements it marked itself (`data-script-lang`), never a template's lang.
 */
import { scriptLanguage } from '../domain/scripts'

const MARK = 'data-script-lang'

/** Sets or clears the language of one element from its direct text. */
function update(element: Element): void {
  if (!(element instanceof HTMLElement)) return
  const own = element.hasAttribute(MARK)
  if (element.hasAttribute('lang') && !own) return
  let text = ''
  for (const node of element.childNodes) if (node.nodeType === Node.TEXT_NODE) text += node.nodeValue ?? ''
  const language = scriptLanguage(text)
  if (language) {
    element.lang = language
    element.setAttribute(MARK, '')
  } else if (own) {
    element.removeAttribute('lang')
    element.removeAttribute(MARK)
  }
}

/** Every element under a node (the node too) that holds text. */
function scan(node: Node): void {
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.parentElement) update(node.parentElement)
    return
  }
  if (!(node instanceof Element)) return
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
  const seen = new Set<Element>()
  for (let text = walker.nextNode(); text; text = walker.nextNode())
    if (text.parentElement && !seen.has(text.parentElement)) {
      seen.add(text.parentElement)
      update(text.parentElement)
    }
}

/** Marks what is under the root now and keeps following its changes. */
export function followScriptLanguages(root: Element): MutationObserver {
  scan(root)
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') {
        if (record.target.parentElement) update(record.target.parentElement)
        continue
      }
      if (record.target instanceof Element) update(record.target)
      for (const node of record.addedNodes) scan(node)
    }
  })
  observer.observe(root, { subtree: true, childList: true, characterData: true })
  return observer
}
