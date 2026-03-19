import { ipcMain } from 'electron'
import { startRemoteControl, stopRemoteControl, isRemoteRunning } from '../services/remote-control'

export function registerRemoteControlHandlers(): void {
  ipcMain.handle('remote:start', async (): Promise<string> => {
    const { url } = startRemoteControl(3333)
    return url
  })

  ipcMain.handle('remote:stop', async (): Promise<void> => {
    stopRemoteControl()
  })

  ipcMain.handle('remote:status', async (): Promise<{ running: boolean; url?: string }> => {
    const running = isRemoteRunning()
    return { running }
  })
}
