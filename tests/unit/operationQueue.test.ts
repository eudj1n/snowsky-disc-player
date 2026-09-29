import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/stores/connection', () => ({
  activeSession: () => ({}),
  onSessionOpened: () => undefined,
}))
vi.mock('../../src/stores/observations', () => ({ observations: { scanActive: false, scanEvents: 0 } }))

const { operation, run } = await import('../../src/stores/operation')

/** A task that runs until released, recording that it ran. */
function held<T>(result: T, ran: string[], name: string) {
  let release: () => void = () => undefined
  const done = new Promise<void>((resolve) => (release = resolve))
  const task = async () => {
    ran.push(name)
    await done
    return result
  }
  return { task, release: () => release() }
}

describe('one device operation at a time', () => {
  let ran: string[]
  beforeEach(() => {
    ran = []
  })

  it('refuses a second request unless it asks to wait', async () => {
    const first = held('confirmed', ran, 'first')
    const running = run('transport', first.task)
    expect(operation.busy).toBe(true)
    expect(await run('volume', () => Promise.resolve('confirmed'))).toBe('busy')
    first.release()
    expect(await running).toBe('confirmed')
    expect(operation.busy).toBe(false)
  })

  it('runs one waiting request after the running one, the newest in place of older ones', async () => {
    const first = held('confirmed', ran, 'first')
    const running = run('transport', first.task)
    const older = run('transport', () => Promise.resolve(ran.push('older')), { wait: true })
    const newer = run('selection', () => Promise.resolve(ran.push('newer') && 'playing'), { wait: true })
    expect(operation.waiting).toBe('selection')
    // The older press gives way without sending anything.
    expect(await older).toBe('superseded')
    first.release()
    expect(await running).toBe('confirmed')
    expect(await newer).toBe('playing')
    expect(ran).toEqual(['first', 'newer'])
    expect(operation.waiting).toBeNull()
    expect(operation.busy).toBe(false)
  })

  it('sends nothing after an uncertain outcome or a failure', async () => {
    const first = held('uncertain', ran, 'first')
    const running = run('transport', first.task)
    const next = run('transport', () => Promise.resolve(ran.push('next')), { wait: true })
    first.release()
    expect(await running).toBe('uncertain')
    expect(await next).toBe('dropped')

    const failing = run('seek', () => Promise.reject(new Error('lost')))
    const after = run('transport', () => Promise.resolve(ran.push('after')), { wait: true })
    await expect(failing).rejects.toThrow('lost')
    expect(await after).toBe('dropped')
    expect(ran).toEqual(['first'])
  })
})
