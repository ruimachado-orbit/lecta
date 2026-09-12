/**
 * Manages Lecta's MCP integration with Claude Desktop.
 *
 * The app does NOT spawn the MCP server itself: Claude Desktop launches the
 * server it finds in claude_desktop_config.json (stdio transport). This module
 * only tracks whether the integration is enabled and manages that registration.
 *
 * In production (DMG), users don't have Node.js installed, so the registered
 * command is Electron's own binary with ELECTRON_RUN_AS_NODE=1.
 */

import { readFile } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import { atomicWriteFile } from './safe-fs'

/** Whether the MCP integration is enabled (Claude Desktop spawns the actual process). */
let mcpEnabled = false

const isDev = (): boolean => !!process.env['ELECTRON_RENDERER_URL']

/** Get the path to the bundled MCP server entry point */
function getMcpServerPath(): string {
  if (isDev()) {
    return join(app.getAppPath(), 'packages', 'mcp-server', 'dist', 'index.js')
  }
  return join(process.resourcesPath, 'mcp-server', 'dist', 'index.js')
}

/** Enable the MCP integration. No process is spawned — Claude Desktop starts the server from its config. */
export function startMcpServer(): void {
  if (mcpEnabled) return
  mcpEnabled = true
  console.log('[MCP] Integration enabled (server is launched by Claude Desktop)')
}

/** Disable the MCP integration. */
export function stopMcpServer(): void {
  if (!mcpEnabled) return
  mcpEnabled = false
  console.log('[MCP] Integration disabled')
}

/** Whether the MCP integration is enabled in this app session. */
export function isMcpServerRunning(): boolean {
  return mcpEnabled
}

// ── Claude Desktop Config ──

function getClaudeConfigPath(): string {
  if (process.platform === 'darwin') {
    return join(app.getPath('home'), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
  }
  if (process.platform === 'win32') {
    return join(app.getPath('appData'), 'Claude', 'claude_desktop_config.json')
  }
  // Linux
  return join(app.getPath('home'), '.config', 'claude', 'claude_desktop_config.json')
}

function parseClaudeConfig(content: string, configPath: string): Record<string, any> {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (err) {
    throw new Error(
      `Claude Desktop config at ${configPath} is not valid JSON (${(err as Error).message}). ` +
        'Fix or remove the file manually; Lecta will not overwrite it.'
    )
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Claude Desktop config at ${configPath} is not a JSON object. Lecta will not overwrite it.`)
  }
  return parsed as Record<string, any>
}

/**
 * Read claude_desktop_config.json. A missing file yields an empty config
 * (start fresh); an unreadable or unparsable file throws so we never clobber it.
 */
async function readClaudeConfig(configPath: string): Promise<Record<string, any>> {
  let content: string
  try {
    content = await readFile(configPath, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw new Error(`Could not read Claude Desktop config: ${(err as Error).message}`)
  }
  return parseClaudeConfig(content, configPath)
}

/** Add Lecta to the Claude Desktop MCP config */
export async function addToClaudeDesktop(): Promise<{ success: boolean; message: string }> {
  const configPath = getClaudeConfigPath()
  const serverPath = getMcpServerPath()

  let config: Record<string, any>
  try {
    config = await readClaudeConfig(configPath)
  } catch (err) {
    return { success: false, message: (err as Error).message }
  }

  if (!config.mcpServers || typeof config.mcpServers !== 'object') {
    config.mcpServers = {}
  }

  if (isDev()) {
    // Dev: use system node
    config.mcpServers.lecta = {
      command: 'node',
      args: [serverPath],
    }
  } else {
    // Production: use Electron binary with ELECTRON_RUN_AS_NODE
    config.mcpServers.lecta = {
      command: process.execPath,
      args: [serverPath],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    }
  }

  await atomicWriteFile(configPath, JSON.stringify(config, null, 2), { backup: true })

  return {
    success: true,
    message: `Added Lecta to Claude Desktop config. Restart Claude Desktop to use it.`,
  }
}

/** Remove Lecta from the Claude Desktop MCP config */
export async function removeFromClaudeDesktop(): Promise<{ success: boolean; message: string }> {
  const configPath = getClaudeConfigPath()

  let content: string
  try {
    content = await readFile(configPath, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { success: true, message: 'Claude Desktop config not found — nothing to remove.' }
    }
    return { success: false, message: `Could not read Claude Desktop config: ${(err as Error).message}` }
  }

  let config: Record<string, any>
  try {
    config = parseClaudeConfig(content, configPath)
  } catch (err) {
    return { success: false, message: (err as Error).message }
  }

  if (config.mcpServers?.lecta) {
    delete config.mcpServers.lecta
    await atomicWriteFile(configPath, JSON.stringify(config, null, 2), { backup: true })
    return { success: true, message: 'Removed Lecta from Claude Desktop config.' }
  }

  return { success: true, message: 'Lecta was not in Claude Desktop config.' }
}

/** Check if Lecta is already configured in Claude Desktop */
export async function isInClaudeDesktop(): Promise<boolean> {
  try {
    const content = await readFile(getClaudeConfigPath(), 'utf-8')
    const config = JSON.parse(content)
    return !!config.mcpServers?.lecta
  } catch {
    return false
  }
}
