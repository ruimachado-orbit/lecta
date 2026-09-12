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

/**
 * These handlers take no filesystem paths from the renderer — every path used
 * here (the bundled server entry, Claude Desktop's config) is derived in the
 * main process. Any path argument added later must go through
 * `assertInsideOpenDeck` from ../services/deck-roots before it is used.
 */
export function registerMcpHandlers(): void {
  ipcMain.handle('mcp:toggle', async (_event, enabled: unknown) => {
    if (enabled === true) {
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
