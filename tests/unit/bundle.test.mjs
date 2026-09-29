import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkBundle } from '../../scripts/check-bundle.mjs'

const dirs = []
function bundle(files) {
  const root = mkdtempSync(join(tmpdir(), 'disc-bundle-'))
  dirs.push(root)
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(root, name, '..'), { recursive: true })
    writeFileSync(join(root, name), content)
  }
  return checkBundle(root)
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('the rules for apps on the card (combined-009)', () => {
  it('accepts a relative Vite-style build', () => {
    const result = bundle({
      'index.html':
        '<script type="module" src="./assets/index-a1.js"></script><link rel="stylesheet" href="./assets/index-b2.css">',
      'assets/index-a1.js': 'fetch("/api/health"); new URL(`../`, import.meta.url)',
      'assets/index-b2.css': 'body{color:red}',
      'assets/font.woff': 'x',
    })
    expect(result.errors).toEqual([])
  })

  it('rejects what the gateway CSP or the card would refuse', () => {
    const errors = bundle({
      'index.html': '<script>alert(1)</script><div style="x" onclick="y"></div>',
      'assets/app.js': 'import("/assets/chunk.js")',
      'assets/tool.exe': 'x',
      'commands.json': '{}',
      'a/b/c/d/e/f/g.js': '',
      '.hidden.js': '',
    }).errors.join('\n')
    for (const expected of [
      'inline script',
      'inline style',
      'inline event handler',
      'root-absolute',
      'extension not allowed',
      'comes from the service',
      'deeper than 6',
      'not start with a dot',
    ]) {
      expect(errors).toContain(expected)
    }
  })

  it('requires relative references in index.html: the app lives at / and at /apps/<App>/', () => {
    const errors = bundle({
      'index.html': '<script type="module" src="/assets/a.js"></script>',
      'assets/a.js': '',
    }).errors
    expect(errors.join('\n')).toContain('resolves only at /')
  })

  it('requires index.html', () => {
    expect(bundle({ 'app.js': '' }).errors).toContain('index.html is missing')
  })
})
