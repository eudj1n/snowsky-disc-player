import { describe, expect, it } from 'vitest'
import { uploadFile } from '../../src/gateway/upload'

/** An XMLHttpRequest stand-in that records headers and answers 201 for the sent path. */
function fakeXhr(answer: (path: string, size: number) => string) {
  const headers: Record<string, string> = {}
  let url = ''
  const xhr = {
    upload: { onprogress: null },
    timeout: 0,
    status: 0,
    responseText: '',
    onload: null as null | (() => void),
    onerror: null,
    ontimeout: null,
    onabort: null,
    open: (_method: string, target: string) => (url = target),
    setRequestHeader: (name: string, value: string) => (headers[name] = value),
    send(body: Blob) {
      xhr.status = 201
      xhr.responseText = answer(decodeURIComponent(url.replace('/api/stock/audio', '')), body.size)
      xhr.onload?.()
    },
  }
  return { headers, create: () => xhr as unknown as XMLHttpRequest }
}

describe('uploading a cover or lyrics over one already there', () => {
  it('asks the service to move the old file to its trash only when told to', async () => {
    const reply = (path: string, size: number) => JSON.stringify({ path, bytes: size, replaced: true })
    const replacing = fakeXhr(reply)
    const file = new Blob(['[00:01.00]Synced'])
    expect(
      await uploadFile({ file, path: 'Album/a.lrc', token: 't'.repeat(43), replace: 'trash', xhr: replacing.create }),
    ).toBe('confirmed')
    expect(replacing.headers['X-Disc-Replace']).toBe('trash')
    const plain = fakeXhr(reply)
    await uploadFile({ file, path: 'Album/b.lrc', token: 't'.repeat(43), xhr: plain.create })
    expect(plain.headers['X-Disc-Replace']).toBeUndefined()
  })
})
