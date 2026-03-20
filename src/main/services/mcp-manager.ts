/**
 * Manages the MCP server lifecycle and Claude Desktop integration.
 * - Spawns/stops the MCP server as a child process
 * - Reads/writes the Claude Desktop config to register Lecta as an MCP server
 *
 * In production (DMG), users don't have Node.js installed.
 * We use Electron's own binary with ELECTRON_RUN_AS_NODE=1
 * to run the MCP server as a plain Node.js script.
 */

import { spawn, ChildProcess } from 'child_process'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'

let mcpProcess: ChildProcess | null = null

const isDev = (): boolean => !!process.env['ELECTRON_RENDERER_URL']

/** Get the path to the bundled MCP server entry point */
function getMcpServerPath(): string {
  if (isDev()) {
    return join(app.getAppPath(), 'packages', 'mcp-server', 'dist', 'index.js')
  }
  return join(process.resourcesPath, 'mcp-server', 'index.js')
}

/**
 * Get the Node.js-compatible command + env for spawning scripts.
 * In dev: use system `node`.
 * In production: use Electron's own binary with ELECTRON_RUN_AS_NODE=1.
 */
function getNodeRuntime(): { command: string; env: Record<string, string> } {
  if (isDev()) {
    return { command: 'node', env: {} }
  }
  // In production, Electron's binary IS Node.js when ELECTRON_RUN_AS_NODE=1
  return {
    command: process.execPath,
    env: { ELECTRON_RUN_AS_NODE: '1' },
  }
}

/** Start the MCP server as a background child process */
export function startMcpServer(): void {
  if (mcpProcess) return // already running

  const serverPath = getMcpServerPath()
  const runtime = getNodeRuntime()

  mcpProcess = spawn(runtime.command, [serverPath], {
    stdio: 'pipe',
    env: { ...process.env, ...runtime.env },
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

  try {
    const content = await readFile(configPath, 'utf-8')
    config = JSON.parse(content)
  } catch {
    // File doesn't exist or is invalid — start fresh
  }

  if (!config.mcpServers) {
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

  const configDir = join(configPath, '..')
  await mkdir(configDir, { recursive: true })
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')

  return {
    success: true,
    message: `Added Lecta to Claude Desktop config. Restart Claude Desktop to use it.`,
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
