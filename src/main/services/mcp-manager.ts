/**
 * Manages the MCP server lifecycle and Claude Desktop integration.
 * - Spawns/stops the MCP server as a child process
 * - Reads/writes the Claude Desktop config to register Lecta as an MCP server
 */

import { spawn, ChildProcess } from 'child_process'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'

let mcpProcess: ChildProcess | null = null

/** Get the path to the bundled MCP server entry point */
function getMcpServerPath(): string {
  const isDev = !!process.env['ELECTRON_RENDERER_URL']
  if (isDev) {
    return join(app.getAppPath(), 'packages', 'mcp-server', 'dist', 'index.js')
  }
  return join(process.resourcesPath, 'mcp-server', 'index.js')
}

/** Start the MCP server as a background child process */
export function startMcpServer(): void {
  if (mcpProcess) return // already running

  const serverPath = getMcpServerPath()
  mcpProcess = spawn(process.execPath.includes('Electron')
    ? 'node'
    : process.execPath, [serverPath], {
    stdio: 'pipe',
    env: { ...process.env },
  })

  mcpProcess.on('error', (err) => {
    console.error('[MCP] Failed to start server:', err.message)
    mcpProcess = null
  })

  mcpProcess.on('exit', (code) => {
    console.log(`[MCP] Server exited with code ${code}`)
    mcpProcess = null
  })

  console.log(`[MCP] Server started (pid: ${mcpProcess.pid})`)
}

/** Stop the MCP server if running */
export function stopMcpServer(): void {
  if (!mcpProcess) return
  mcpProcess.kill()
  mcpProcess = null
  console.log('[MCP] Server stopped')
}

/** Check if the MCP server is running */
export function isMcpServerRunning(): boolean {
  return mcpProcess !== null && !mcpProcess.killed
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

/** Add Lecta to the Claude Desktop MCP config */
export async function addToClaudeDesktop(): Promise<{ success: boolean; message: string }> {
  const configPath = getClaudeConfigPath()
  const serverPath = getMcpServerPath()

  let config: Record<string, any> = {}

  // Read existing config if present
  try {
    const content = await readFile(configPath, 'utf-8')
    config = JSON.parse(content)
  } catch {
    // File doesn't exist or is invalid — start fresh
  }

  if (!config.mcpServers) {
    config.mcpServers = {}
  }

  // Add or update the lecta entry
  config.mcpServers.lecta = {
    command: 'node',
    args: [serverPath],
  }

  // Ensure directory exists
  const configDir = join(configPath, '..')
  await mkdir(configDir, { recursive: true })

  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')

  return {
    success: true,
    message: `Added Lecta to Claude Desktop config at ${configPath}. Restart Claude Desktop to use it.`,
  }
}

/** Remove Lecta from the Claude Desktop MCP config */
export async function removeFromClaudeDesktop(): Promise<{ success: boolean; message: string }> {
  const configPath = getClaudeConfigPath()

  try {
    const content = await readFile(configPath, 'utf-8')
    const config = JSON.parse(content)

    if (config.mcpServers?.lecta) {
      delete config.mcpServers.lecta
      await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
      return { success: true, message: 'Removed Lecta from Claude Desktop config.' }
    }

    return { success: true, message: 'Lecta was not in Claude Desktop config.' }
  } catch {
    return { success: true, message: 'Claude Desktop config not found — nothing to remove.' }
  }
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
