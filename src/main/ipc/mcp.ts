import { ipcMain } from 'electron'
import {
  startMcpServer,
  stopMcpServer,
  isMcpServerRunning,
  addToClaudeDesktop,
  removeFromClaudeDesktop,
  isInClaudeDesktop
} from '../services/mcp-manager'
import { loadSettings } from './settings'

export function registerMcpHandlers(): void {
  ipcMain.handle('mcp:toggle', async (_event, enabled: boolean) => {
    if (enabled) {
      startMcpServer()
    } else {
      stopMcpServer()
    }
    return { running: isMcpServerRunning() }
  })

  ipcMain.handle('mcp:status', async () => {
    const settings = await loadSettings()
    return {
      enabled: !!settings.mcpServerEnabled,
      running: isMcpServerRunning(),
      inClaudeDesktop: await isInClaudeDesktop()
    }
  })

  ipcMain.handle('mcp:add-to-claude', async () => {
    return addToClaudeDesktop()
  })

  ipcMain.handle('mcp:remove-from-claude', async () => {
    return removeFromClaudeDesktop()
  })
}
