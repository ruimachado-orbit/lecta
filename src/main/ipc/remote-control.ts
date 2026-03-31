import { ipcMain, BrowserWindow } from 'electron'
import { startRemoteControl, stopRemoteControl, isRemoteRunning } from '../services/remote-control'

export function registerRemoteControlHandlers(): void {
  ipcMain.handle('remote:start', async (event): Promise<string> => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const { url } = startRemoteControl(3333, senderWindow)
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
