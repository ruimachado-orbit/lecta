import { ipcMain } from 'electron'
import { NativeExecutor } from '../services/native-executor'
import { isInsideOpenDeck } from '../services/deck-roots'
import { loadSettings } from './settings'
import { EXECUTION_TIMEOUT_MS } from '../../../packages/shared/src/constants'
import type { ExecutionResult } from '../../../packages/shared/src/types/execution'

/** One executor per requesting webContents; a second concurrent run per sender is rejected. */
const executors = new Map<number, NativeExecutor>()

/** Bare program name only — no path separators, no shell metacharacters. */
const COMMAND_RE = /^[A-Za-z0-9_.+-]+$/

export function registerExecutionHandlers(): void {
  ipcMain.handle(
    'exec:native',
    async (event, command: string, args: string[], cwd: string): Promise<ExecutionResult> => {
      const settings = await loadSettings()
      if (!settings.nativeExecutionEnabled) {
        throw new Error('Native execution is disabled. Enable it in Settings to run native code slides.')
      }

      if (typeof cwd !== 'string' || !isInsideOpenDeck(cwd)) {
        throw new Error('Native execution refused: working directory is outside the open presentation.')
      }

      if (typeof command !== 'string' || !COMMAND_RE.test(command)) {
        throw new Error(
          `Native execution refused: command must be a bare program name (got ${JSON.stringify(command)}).`
        )
      }

      if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) {
        throw new Error('Native execution refused: args must be an array of strings.')
      }

      const sender = event.sender
      const senderId = sender.id
      if (executors.has(senderId)) {
        throw new Error('A native execution is already running for this window. Cancel it first.')
      }

      const timeout =
        typeof settings.executionTimeout === 'number' && settings.executionTimeout > 0
          ? settings.executionTimeout
          : EXECUTION_TIMEOUT_MS

      const executor = new NativeExecutor()
      executors.set(senderId, executor)

      const send = (channel: string, payload: unknown): void => {
        if (!sender.isDestroyed()) sender.send(channel, payload)
      }

      executor.onStdout((data) => send('exec:output', data))
      executor.onStderr((data) => send('exec:error', data))

      try {
        const result = await executor.execute(command, args, cwd, timeout)
        send('exec:done', result)
        return result
      } finally {
        if (executors.get(senderId) === executor) executors.delete(senderId)
      }
    }
  )

  ipcMain.handle('exec:cancel', async (event) => {
    const executor = executors.get(event.sender.id)
    if (executor) {
      executor.cancel()
    }
  })
}
