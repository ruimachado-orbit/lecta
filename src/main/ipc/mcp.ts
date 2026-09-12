import { ipcMain } from 'electron'
import {
  startMcpServer,
  stopMcpServer,
  isMcpServerRunning,
  addToClaudeDesktop,
  removeFromClaudeDesktop,
  isInClaudeDesktop
} from '../services/mcp-manager'
import {
  MCP_SERVERS_SETTING,
  listExternalServers,
  listExternalTools,
  normalizeServerConfig,
  invalidateMcpClient
} from '../services/mcp-client-manager'
import { loadSettings, updateSettings } from './settings'

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

  // ── External MCP servers (data sources for the agent) ──

  ipcMain.handle('mcp:list-external-servers', async () => {
    return listExternalServers()
  })

  ipcMain.handle('mcp:add-external-server', async (_event, server: unknown) => {
    const config = normalizeServerConfig(server)
    if (!config) return { success: false, message: 'A server needs a name and a command.' }
    const current = listExternalServers()
    if (current.some((s) => s.name === config.name)) {
      return { success: false, message: `A server named "${config.name}" already exists.` }
    }
    await updateSettings({ [MCP_SERVERS_SETTING]: [...current, config] })
    return { success: true }
  })

  ipcMain.handle('mcp:remove-external-server', async (_event, name: unknown) => {
    if (typeof name !== 'string' || !name) return { success: false, message: 'Missing server name.' }
    const current = listExternalServers()
    const next = current.filter((s) => s.name !== name)
    if (next.length === current.length) {
      return { success: false, message: `No server named "${name}" is configured.` }
    }
    invalidateMcpClient(name)
    await updateSettings({ [MCP_SERVERS_SETTING]: next })
    return { success: true }
  })

  /** Probe a server (add or existing) and return its tools — used by the settings UI. */
  ipcMain.handle('mcp:test-external-server', async (_event, server: unknown) => {
    const config = normalizeServerConfig(server)
    if (!config) return { success: false, message: 'A server needs a name and a command.' }
    const { McpClient } = await import('../services/mcp-client')
    const client = new McpClient(config)
    try {
      const tools = await client.listTools()
      return { success: true, tools: tools.map((t) => t.name) }
    } catch (err) {
      return { success: false, message: (err as Error).message }
    } finally {
      client.dispose()
    }
  })
}
