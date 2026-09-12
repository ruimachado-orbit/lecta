import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { createInterface, type Interface } from 'readline'

/**
 * A minimal Model Context Protocol client over the stdio transport.
 *
 * Speaks the JSON-RPC 2.0 messages MCP servers emit on stdout (one per line).
 * Enough for `initialize`, `tools/list` and `tools/call` — the surface Lecta's
 * agent needs to pull live data from external MCP servers.
 */

export interface McpServerConfig {
  name: string
  command: string
  args?: string[]
}

export interface McpTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

const DEFAULT_TIMEOUT_MS = 30_000
const INIT_TIMEOUT_MS = 15_000

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

/** Reduce an MCP `tools/call` result to plain text (plus an isError flag). */
export function extractToolResultText(result: unknown): { text: string; isError: boolean } {
  if (result && typeof result === 'object') {
    const obj = result as { content?: unknown; structuredContent?: unknown; isError?: boolean }
    const isError = obj.isError === true
    if (Array.isArray(obj.content)) {
      const text = obj.content
        .map((c) => {
          if (c && typeof c === 'object') {
            const part = c as { type?: string; text?: string }
            return part.text ?? JSON.stringify(part)
          }
          return String(c)
        })
        .join('\n')
      return { text: text || JSON.stringify(obj), isError }
    }
    if (obj.structuredContent !== undefined) {
      return { text: JSON.stringify(obj.structuredContent), isError }
    }
    return { text: JSON.stringify(obj), isError }
  }
  return { text: String(result ?? ''), isError: false }
}

export class McpClient {
  private proc: ChildProcessWithoutNullStreams | null = null
  private rl: Interface | null = null
  private nextId = 1
  private pending = new Map<number, PendingRequest>()
  private tools: McpTool[] = []
  private toolsLoaded = false
  private startPromise: Promise<void> | null = null
  private lastError: Error | null = null

  constructor(private readonly config: McpServerConfig) {}

  private ensureStarted(): Promise<void> {
    if (this.startPromise) return this.startPromise
    this.startPromise = this.start().finally(() => {
      this.startPromise = null
    })
    return this.startPromise
  }

  private start(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false
      const fail = (err: Error): void => {
        if (settled) return
        settled = true
        this.lastError = err
        reject(err)
      }

      let proc: ChildProcessWithoutNullStreams
      try {
        proc = spawn(this.config.command, this.config.args ?? [], {
          stdio: ['pipe', 'pipe', 'pipe']
        })
      } catch (err) {
        fail(err as Error)
        return
      }
      this.proc = proc

      proc.on('error', (err) => fail(err))
      proc.stderr.on('data', () => {
        /* stderr is diagnostics, not protocol */
      })

      const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity })
      this.rl = rl
      rl.on('line', (line) => this.handleLine(line))

      proc.on('exit', (code) => {
        this.failAllPending(new Error(`MCP server "${this.config.name}" exited (code ${code}).`))
      })

      void (async () => {
        try {
          const initResult = (await this.request('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'lecta', version: '0.1.0' }
          }, INIT_TIMEOUT_MS)) as { protocolVersion?: string; serverInfo?: unknown }
          if (settled) return
          this.sendNotification('notifications/initialized')
          // Some servers only reveal tools after initialize; refresh lazily.
          this.toolsLoaded = false
          resolve()
        } catch (err) {
          fail(err as Error)
        }
      })()
    })
  }

  private handleLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return
    let message: { id?: number; result?: unknown; error?: { message?: string }; method?: string }
    try {
      message = JSON.parse(trimmed)
    } catch {
      return
    }
    if (message.id !== undefined && message.id !== null) {
      const pending = this.pending.get(message.id)
      if (pending) {
        clearTimeout(pending.timer)
        this.pending.delete(message.id)
        if (message.error) {
          pending.reject(new Error(message.error.message || 'MCP request failed.'))
        } else {
          pending.resolve(message.result)
        }
      }
    }
    // Notifications (no id) are ignored; the client does not advertise
    // resources/prompts subscriptions.
  }

  private sendNotification(method: string, params?: unknown): void {
    if (!this.proc || !this.proc.stdin.writable) return
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
  }

  private request(method: string, params: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.proc || !this.proc.stdin.writable) {
        reject(new Error(`MCP server "${this.config.name}" is not running.`))
        return
      }
      const id = this.nextId++
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`MCP server "${this.config.name}" timed out (${method}).`))
      }, timeoutMs)
      timer.unref?.()
      this.pending.set(id, { resolve, reject, timer })
      this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    })
  }

  private failAllPending(err: Error): void {
    for (const pending of [...this.pending.values()]) {
      clearTimeout(pending.timer)
      pending.reject(err)
    }
    this.pending.clear()
  }

  async listTools(): Promise<McpTool[]> {
    await this.ensureStarted()
    if (this.toolsLoaded) return this.tools
    const result = (await this.request('tools/list', {})) as { tools?: McpTool[] }
    this.tools = Array.isArray(result?.tools) ? result.tools : []
    this.toolsLoaded = true
    return this.tools
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
    await this.ensureStarted()
    const result = await this.request('tools/call', { name, arguments: args ?? {} })
    return extractToolResultText(result)
  }

  dispose(): void {
    if (this.rl) {
      this.rl.close()
      this.rl = null
    }
    if (this.proc) {
      this.proc.kill()
      this.proc = null
    }
    this.failAllPending(new Error('MCP client disposed.'))
  }
}
