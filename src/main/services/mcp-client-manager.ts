import { getCachedSettings } from '../ipc/settings'
import { McpClient, type McpServerConfig, type McpTool } from './mcp-client'

/**
 * Registry of external MCP servers the agent may call. Servers are stored in
 * `settings.json` under `mcpServers` and connected lazily; a live client is
 * cached per server and reused across calls.
 */

export const MCP_SERVERS_SETTING = 'mcpServers'

export function normalizeServerConfig(value: unknown): McpServerConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const obj = value as Record<string, unknown>
  const name = typeof obj.name === 'string' ? obj.name.trim() : ''
  const command = typeof obj.command === 'string' ? obj.command.trim() : ''
  if (!name || !command) return null
  const args = Array.isArray(obj.args)
    ? obj.args.filter((a): a is string => typeof a === 'string')
    : undefined
  return { name, command, ...(args && args.length > 0 ? { args } : {}) }
}

export function listExternalServers(): McpServerConfig[] {
  const raw = getCachedSettings()[MCP_SERVERS_SETTING]
  if (!Array.isArray(raw)) return []
  const servers: McpServerConfig[] = []
  for (const entry of raw) {
    const config = normalizeServerConfig(entry)
    if (config) servers.push(config)
  }
  return servers
}

const clients = new Map<string, McpClient>()

function getClient(config: McpServerConfig): McpClient {
  let client = clients.get(config.name)
  if (!client) {
    client = new McpClient(config)
    clients.set(config.name, client)
  }
  return client
}

/** Drop every cached client (e.g. after a server is removed). */
export function invalidateMcpClients(): void {
  for (const client of clients.values()) client.dispose()
  clients.clear()
}

export function invalidateMcpClient(name: string): void {
  const client = clients.get(name)
  if (client) {
    client.dispose()
    clients.delete(name)
  }
}

/** List every tool on every configured server, prefixed by its server name. */
export async function listExternalTools(): Promise<{ server: string; tool: McpTool }[]> {
  const out: { server: string; tool: McpTool }[] = []
  for (const server of listExternalServers()) {
    try {
      const tools = await getClient(server).listTools()
      for (const tool of tools) out.push({ server: server.name, tool })
    } catch (err) {
      // A server that fails to connect is skipped; the agent can still use the rest.
      console.warn(`[mcp-client] listing tools from "${server.name}" failed:`, (err as Error).message)
    }
  }
  return out
}

export async function callExternalTool(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ text: string; isError: boolean }> {
  const server = listExternalServers().find((s) => s.name === serverName)
  if (!server) {
    return { text: `No external MCP server named "${serverName}" is configured.`, isError: true }
  }
  try {
    const client = getClient(server)
    // Fail fast if the tool does not exist on this server.
    const tools = await client.listTools()
    if (!tools.some((t) => t.name === toolName)) {
      return {
        text: `Server "${serverName}" has no tool named "${toolName}". Available tools: ${tools.map((t) => t.name).join(', ') || '(none)'}.`,
        isError: true
      }
    }
    return await client.callTool(toolName, args)
  } catch (err) {
    return { text: `Call to ${serverName}.${toolName} failed: ${(err as Error).message}`, isError: true }
  }
}
