import { describe, it, expect, vi } from 'vitest'

// The module under test lives in Electron's main process; only the ipcMain
// surface is touched at import time.
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => '/tmp', getVersion: () => '0.0.0' },
}))

const { withCancellation, cancelAIForSender } = await import('./ai')

/** Minimal stand-in for the IpcMainInvokeEvent the handlers receive. */
function fakeEvent(senderId: number): Parameters<typeof withCancellation>[0] {
  return { sender: { id: senderId } } as unknown as Parameters<typeof withCancellation>[0]
}

/** A promise that only settles when the signal aborts. */
function untilAborted(signal: AbortSignal): Promise<string> {
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve('aborted'), { once: true })
  })
}

describe('ai IPC cancellation', () => {
  it('aborts the in-flight request for the sender that asked', async () => {
    const work = withCancellation(fakeEvent(1), untilAborted)
    cancelAIForSender(1)
    expect(await work).toBe('aborted')
  })

  it('leaves other windows alone', async () => {
    let otherAborted = false
    const other = withCancellation(fakeEvent(2), (signal) => {
      signal.addEventListener('abort', () => { otherAborted = true }, { once: true })
      return untilAborted(signal)
    })
    const mine = withCancellation(fakeEvent(1), untilAborted)

    cancelAIForSender(1)
    expect(await mine).toBe('aborted')
    expect(otherAborted).toBe(false)

    cancelAIForSender(2)
    await other
  })

  it('cancels every concurrent request from the same window', async () => {
    const first = withCancellation(fakeEvent(3), untilAborted)
    const second = withCancellation(fakeEvent(3), untilAborted)
    cancelAIForSender(3)
    expect(await Promise.all([first, second])).toEqual(['aborted', 'aborted'])
  })

  it('is a no-op when the window has nothing running', () => {
    expect(() => cancelAIForSender(99)).not.toThrow()
  })

  it('does not cancel a request that already finished', async () => {
    const signals: AbortSignal[] = []
    await withCancellation(fakeEvent(4), async (signal) => {
      signals.push(signal)
      return 'done'
    })
    cancelAIForSender(4)
    expect(signals[0].aborted).toBe(false)
  })
})
