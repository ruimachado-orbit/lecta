import { ipcMain } from 'electron'
import { getLocalApiStatus, isLocalApiRunning, startLocalApi, stopLocalApi } from '../services/local-api'
import { loadSettings } from './settings'

export function registerLocalApiHandlers(): void {
  ipcMain.handle('local-api:toggle', async (_event, enabled: unknown) => {
    if (enabled === true) {
      startLocalApi()
    } else {
      stopLocalApi()
    }
    return { running: isLocalApiRunning() }
  })

  ipcMain.handle('local-api:status', async () => {
    const settings = await loadSettings()
    return {
      ...getLocalApiStatus(),
      enabled: !!settings.localApiEnabled,
    }
  })
}
