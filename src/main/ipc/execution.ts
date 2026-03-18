import { ipcMain, BrowserWindow } from 'electron'
import { NativeExecutor } from '../services/native-executor'
import type { ExecutionResult } from '../../../packages/shared/src/types/execution'

let activeExecutor: NativeExecutor | null = null

export function registerExecutionHandlers(): void {
  ipcMain.handle(
    'exec:native',
    async (_event, command: string, args: string[], cwd: string): Promise<ExecutionResult> => {
      const window = BrowserWindow.getFocusedWindow()

      activeExecutor = new NativeExecutor()

      // Stream stdout to renderer
      activeExecutor.onStdout((data) => {
        window?.webContents.send('exec:output', data)
      })

      // Stream stderr to renderer
      activeExecutor.onStderr((data) => {
        window?.webContents.send('exec:error', data)
      })

      const result = await activeExecutor.execute(command, args, cwd)
      activeExecutor = null

      window?.webContents.send('exec:done', result)
      return result
    }
  )

  ipcMain.handle('exec:cancel', async () => {
    if (activeExecutor) {
      activeExecutor.cancel()
      activeExecutor = null
    }
  })
}
