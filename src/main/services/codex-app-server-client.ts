import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { app } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { createInterface, type Interface } from 'readline'
import { loadCodexBinPath } from './env-loader'
import { DEFAULT_CODEX_MODEL } from '../../../packages/shared/src/constants'

type JsonRpcId = number

interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

interface JsonRpcMessage {
  id?: JsonRpcId
  method?: string
  params?: unknown
  result?: unknown
  error?: JsonRpcError
}

interface PendingRequest<T> {
  resolve: (value: T) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

export type CodexAccount =
  | { type: 'chatgpt'; email: string; planType: string }
  | { type: 'apiKey' }
  | { type: 'amazonBedrock' }

export interface CodexAccountReadResponse {
  account: CodexAccount | null
  requiresOpenaiAuth: boolean
}

interface CodexThreadStartResponse {
  thread: { id: string }
  model: string
  modelProvider: string
}

interface CodexTurnStartResponse {
  turn: { id: string }
}

interface CodexTurnCompletedNotification {
  threadId: string
  turn: {
    status: 'completed' | 'interrupted' | 'failed' | 'inProgress'
    error: { message: string } | null
  }
}

interface CodexAgentMessageDeltaNotification {
  threadId: string
  turnId: string
  delta: string
}

interface CodexItemCompletedNotification {
  threadId: string
  turnId: string
  item: {
    type: string
    text?: string
    result?: string
    savedPath?: string
    status?: string
  }
}

export interface CodexDynamicToolSpec {
  namespace?: string
  name: string
  description: string
  inputSchema: unknown
  deferLoading?: boolean
}

export interface CodexDynamicToolCall {
  threadId: string
  turnId: string
  callId: string
  namespace?: string | null
  tool: string
  arguments: unknown
}

export interface CodexDynamicToolResponse {
  contentItems: Array<
    | { type: 'inputText'; text: string }
    | { type: 'inputImage'; imageUrl: string }
  >
  success: boolean
}

type CodexUserInput =
  | { type: 'text'; text: string; text_elements: [] }
  | { type: 'image'; url: string }

interface CodexImageResult {
  base64: string
  mimeType: string
  savedPath?: string
}

type NotificationHandler<T = unknown> = (params: T) => void
type DynamicToolHandler = (call: CodexDynamicToolCall) => Promise<CodexDynamicToolResponse>
type ExitHandler = (reason: Error) => void

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
/** Whole-turn bound (turn/start → turn/completed). Override with LECTA_CODEX_TURN_TIMEOUT_MS or per call. */
const DEFAULT_TURN_TIMEOUT_MS = 180_000

function resolveTurnTimeout(override?: number): number {
  if (override && override > 0) return override
  const fromEnv = Number(process.env.LECTA_CODEX_TURN_TIMEOUT_MS)
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_TURN_TIMEOUT_MS
}

/**
 * Codex threads run in a scratch directory, never in the deck folder: decks
 * can carry per-deck `.env` files with API keys and Codex has a shell tool.
 */
function getCodexScratchDir(): string {
  const dir = join(app.getPath('temp'), 'lecta-codex')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    // Fall through — Codex reports a clear error if the directory is unusable.
  }
  return dir
}

interface ActiveTurn {
  threadId: string
  turnId: string | null
  abort: (reason: Error) => void
}

export class CodexAppServerClient {
  private proc: ChildProcessWithoutNullStreams | null = null
  private stdoutReader: Interface | null = null
  private nextId = 1
  private startPromise: Promise<void> | null = null
  private pending = new Map<number, PendingRequest<unknown>>()
  private notificationHandlers = new Map<string, Set<NotificationHandler>>()
  private dynamicToolHandlers = new Map<string, DynamicToolHandler>()
  private exitHandlers = new Set<ExitHandler>()
  private activeTurns = new Map<string, ActiveTurn>()

  async start(): Promise<void> {
    if (this.proc) return
    if (this.startPromise) return this.startPromise

    this.startPromise = this.startProcess().finally(() => {
      this.startPromise = null
    })

    return this.startPromise
  }

  private async startProcess(): Promise<void> {
    const configuredBin = await loadCodexBinPath()
    const codexBin = configuredBin || process.env.CODEX_BIN || 'codex'

    const child = spawn(codexBin, ['app-server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.proc = child
    this.stdoutReader = createInterface({ input: child.stdout })

    this.stdoutReader.on('line', (line) => this.handleStdoutLine(line))
    child.stderr.on('data', (chunk: Buffer) => {
      const line = chunk.toString('utf-8').trim()
      if (line) console.warn(`[codex app-server] ${line}`)
    })
    child.once('error', (err) => this.handleExit(new Error(this.formatCodexStartError(err))))
    child.once('close', () => this.handleExit())
    // Without this, a missing binary or EPIPE on stdin is an uncaught exception in the main process.
    child.stdin.on('error', (err) => this.handleExit(new Error(`Codex app-server stdin error: ${err.message}`)))

    const spawnError = new Promise<never>((_resolve, reject) => {
      child.once('error', (err) => {
        reject(new Error(this.formatCodexStartError(err)))
      })
    })
    const spawned = new Promise<void>((resolve) => {
      child.once('spawn', () => resolve())
    })

    // Only write to stdin once the process actually exists.
    await Promise.race([spawned, spawnError])

    await Promise.race([
      this.request('initialize', {
        clientInfo: {
          name: 'lecta',
          title: 'Lecta',
          version: app.getVersion(),
        },
        capabilities: {
          experimentalApi: true,
          optOutNotificationMethods: [],
        },
      }),
      spawnError,
    ])

    this.notify('initialized')
  }

  private formatCodexStartError(err: Error): string {
    const maybeNodeErr = err as NodeJS.ErrnoException
    if (maybeNodeErr.code === 'ENOENT') {
      return 'Codex CLI not found. Install it with "npm install -g @openai/codex", then run "codex login", or configure a custom Codex path in Settings.'
    }
    return `Failed to start Codex app-server: ${err.message}`
  }

  private handleStdoutLine(line: string): void {
    if (!line.trim()) return

    let msg: JsonRpcMessage
    try {
      msg = JSON.parse(line) as JsonRpcMessage
    } catch {
      return
    }

    if (typeof msg.id === 'number' && msg.method) {
      void this.handleServerRequest(msg.id, msg.method, msg.params)
      return
    }

    if (typeof msg.id === 'number') {
      const pending = this.pending.get(msg.id)
      if (!pending) return
      this.pending.delete(msg.id)
      clearTimeout(pending.timer)

      if (msg.error) {
        pending.reject(new Error(msg.error.message))
      } else {
        pending.resolve(msg.result)
      }
      return
    }

    if (msg.method) {
      const handlers = this.notificationHandlers.get(msg.method)
      handlers?.forEach((handler) => handler(msg.params))
    }
  }

  private async handleServerRequest(id: number, method: string, params: unknown): Promise<void> {
    try {
      if (method !== 'item/tool/call') {
        throw new Error(`Unsupported Codex app-server request: ${method}`)
      }

      const call = params as CodexDynamicToolCall
      const handler = this.dynamicToolHandlers.get(call.threadId)
      if (!handler) {
        throw new Error(`No dynamic tool handler registered for thread ${call.threadId}`)
      }

      this.writeResponse(id, await handler(call))
    } catch (err) {
      this.writeError(id, err)
    }
  }

  /** Write one JSON-RPC line; returns false when the process is gone or stdin is not writable. */
  private writeLine(payload: unknown): boolean {
    const stdin = this.proc?.stdin
    if (!stdin || stdin.destroyed || !stdin.writable) return false
    try {
      stdin.write(`${JSON.stringify(payload)}\n`)
      return true
    } catch (err) {
      this.handleExit(new Error(`Codex app-server stdin write failed: ${(err as Error).message}`))
      return false
    }
  }

  private writeResponse(id: number, result: unknown): void {
    this.writeLine({ id, result })
  }

  private writeError(id: number, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err)
    this.writeLine({ id, error: { code: -32000, message } })
  }

  private handleExit(reason = new Error('Codex app-server exited')): void {
    if (
      !this.proc &&
      !this.stdoutReader &&
      this.pending.size === 0 &&
      this.dynamicToolHandlers.size === 0 &&
      this.exitHandlers.size === 0
    ) return
    this.proc = null
    try {
      this.stdoutReader?.close()
    } catch {
      // readline may already be closed when the child process fails during spawn.
    }
    this.stdoutReader = null

    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(reason)
    }
    this.pending.clear()
    this.dynamicToolHandlers.clear()

    for (const turn of [...this.activeTurns.values()]) {
      turn.abort(reason)
    }
    this.activeTurns.clear()

    const exitHandlers = [...this.exitHandlers]
    this.exitHandlers.clear()
    for (const handler of exitHandlers) {
      handler(reason)
    }
  }

  onNotification<T = unknown>(method: string, handler: NotificationHandler<T>): () => void {
    let handlers = this.notificationHandlers.get(method)
    if (!handlers) {
      handlers = new Set()
      this.notificationHandlers.set(method, handlers)
    }
    handlers.add(handler as NotificationHandler)
    return () => handlers?.delete(handler as NotificationHandler)
  }

  onExit(handler: ExitHandler): () => void {
    this.exitHandlers.add(handler)
    return () => this.exitHandlers.delete(handler)
  }

  async request<T = unknown>(
    method: string,
    params?: unknown,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
  ): Promise<T> {
    if (!this.proc) {
      throw new Error('Codex app-server is not running')
    }

    const id = this.nextId++
    const message = params === undefined ? { id, method } : { id, method, params }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Codex app-server request timed out: ${method}`))
      }, timeoutMs)

      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
      if (!this.writeLine(message)) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(new Error('Codex app-server is not accepting input'))
      }
    })
  }

  notify(method: string, params?: unknown): void {
    if (!this.proc) return
    const message = params === undefined ? { method } : { method, params }
    this.writeLine(message)
  }

  /**
   * Interrupt every in-flight turn: sends `turn/interrupt` to Codex and rejects
   * the awaiting callers. Safe to call when nothing is running.
   */
  async cancelTurn(): Promise<void> {
    const turns = [...this.activeTurns.values()]
    this.activeTurns.clear()
    await Promise.all(turns.map(async (turn) => {
      turn.abort(new Error('Codex turn cancelled'))
      if (turn.turnId) {
        try {
          await this.request('turn/interrupt', { threadId: turn.threadId, turnId: turn.turnId }, 5_000)
        } catch (err) {
          console.warn('[codex app-server] turn/interrupt failed:', (err as Error).message)
        }
      }
    }))
  }

  /**
   * Bound a turn with a timeout and register it for cancellation. Returns the
   * promise to await plus a `finish` cleanup to call when the turn is over.
   */
  private trackTurn(threadId: string, turnCompleted: Promise<void>, timeoutMs: number): {
    bounded: Promise<void>
    setTurnId: (turnId: string) => void
    finish: () => void
  } {
    let abort: (reason: Error) => void = () => {}
    const aborted = new Promise<never>((_resolve, reject) => {
      abort = reject
    })
    const active: ActiveTurn = { threadId, turnId: null, abort }
    this.activeTurns.set(threadId, active)

    const timer = setTimeout(() => {
      this.activeTurns.delete(threadId)
      abort(new Error(`Codex turn timed out after ${Math.round(timeoutMs / 1000)}s`))
      if (active.turnId) {
        this.request('turn/interrupt', { threadId, turnId: active.turnId }, 5_000).catch((err) => {
          console.warn('[codex app-server] turn/interrupt failed:', (err as Error).message)
        })
      }
    }, timeoutMs)

    return {
      bounded: Promise.race([turnCompleted, aborted]),
      setTurnId: (turnId) => { active.turnId = turnId },
      finish: () => {
        clearTimeout(timer)
        this.activeTurns.delete(threadId)
      },
    }
  }

  async accountRead(refreshToken = false): Promise<CodexAccountReadResponse> {
    await this.start()
    return this.request<CodexAccountReadResponse>('account/read', { refreshToken })
  }

  async listModels(): Promise<unknown> {
    await this.start()
    return this.request('model/list', { limit: 100, includeHidden: false })
  }

  async ensureChatGPTAccount(): Promise<Extract<CodexAccount, { type: 'chatgpt' }>> {
    const accountResponse = await this.accountRead(false)
    const account = accountResponse.account
    if (!account) {
      throw new Error('Codex CLI is not signed in. Run "codex login" and choose ChatGPT, then retry.')
    }
    if (account.type !== 'chatgpt') {
      throw new Error('Codex is not using ChatGPT subscription auth. Run "codex logout" and then "codex login" with ChatGPT.')
    }
    return account
  }

  async streamText(params: {
    system: string
    userMessage: string
    model?: string
    onChunk: (chunk: string) => void
    dynamicTools?: CodexDynamicToolSpec[]
    onDynamicToolCall?: DynamicToolHandler
    finalInstruction?: string | null
    turnTimeoutMs?: number
  }): Promise<string> {
    await this.start()
    await this.ensureChatGPTAccount()

    const model = params.model || DEFAULT_CODEX_MODEL
    const threadResult = await this.request<CodexThreadStartResponse>('thread/start', {
      ...(model ? { model } : {}),
      cwd: getCodexScratchDir(),
      approvalPolicy: 'never',
      sandbox: 'read-only',
      experimentalRawEvents: false,
      persistExtendedHistory: false,
      ...(params.dynamicTools?.length ? { dynamicTools: params.dynamicTools } : {}),
    })

    const threadId = threadResult.thread.id
    if (params.onDynamicToolCall) {
      this.dynamicToolHandlers.set(threadId, params.onDynamicToolCall)
    }

    let activeTurnId: string | null = null
    let fullText = ''
    let completedText = ''

    const offDelta = this.onNotification<CodexAgentMessageDeltaNotification>(
      'item/agentMessage/delta',
      (event) => {
        if (event.threadId !== threadId) return
        if (activeTurnId && event.turnId !== activeTurnId) return
        if (!event.delta) return
        fullText += event.delta
        params.onChunk(event.delta)
      }
    )

    const offItemCompleted = this.onNotification<CodexItemCompletedNotification>(
      'item/completed',
      (event) => {
        if (event.threadId !== threadId) return
        if (activeTurnId && event.turnId !== activeTurnId) return
        if (event.item.type === 'agentMessage' && event.item.text) {
          completedText += event.item.text
        }
      }
    )

    let offCompleted: () => void = () => {}
    let offExit: () => void = () => {}
    const turnCompleted = new Promise<void>((resolve, reject) => {
      offExit = this.onExit(reject)
      offCompleted = this.onNotification<CodexTurnCompletedNotification>(
        'turn/completed',
        (event) => {
          if (event.threadId !== threadId) return

          offCompleted()
          if (event.turn.status === 'failed') {
            reject(new Error(event.turn.error?.message ?? 'Codex turn failed'))
            return
          }
          if (event.turn.status !== 'completed') {
            reject(new Error(`Codex turn ended with status: ${event.turn.status}`))
            return
          }
          resolve()
        }
      )
    })

    const finalInstruction = params.finalInstruction === undefined
      ? 'Output only the requested final content. Do not describe your process.'
      : params.finalInstruction
    const prompt = finalInstruction
      ? `${params.system}\n\n${params.userMessage}\n\n${finalInstruction}`
      : `${params.system}\n\n${params.userMessage}`

    const turnTimeoutMs = resolveTurnTimeout(params.turnTimeoutMs)
    const tracked = this.trackTurn(threadId, turnCompleted, turnTimeoutMs)
    // Avoid an unhandled rejection if the turn fails before we await it.
    turnCompleted.catch(() => {})

    try {
      const turnResult = await Promise.race([
        this.request<CodexTurnStartResponse>(
          'turn/start',
          {
            threadId,
            input: [{ type: 'text', text: prompt, text_elements: [] }],
            approvalPolicy: 'never',
            sandboxPolicy: { type: 'readOnly', networkAccess: false },
            ...(model ? { model } : {}),
          },
          turnTimeoutMs
        ),
        tracked.bounded.then(() => { throw new Error('Codex turn completed before it was acknowledged') }),
      ])
      activeTurnId = turnResult.turn.id
      tracked.setTurnId(turnResult.turn.id)

      await tracked.bounded
      return fullText || completedText
    } finally {
      tracked.finish()
      this.dynamicToolHandlers.delete(threadId)
      offExit()
      offCompleted()
      offDelta()
      offItemCompleted()
    }
  }

  async generateImage(params: {
    prompt: string
    aspectRatio?: string
    model?: string
    imageBase64?: string
    imageMimeType?: string
    turnTimeoutMs?: number
  }): Promise<CodexImageResult> {
    await this.start()
    await this.ensureChatGPTAccount()

    const model = params.model || DEFAULT_CODEX_MODEL
    const threadResult = await this.request<CodexThreadStartResponse>('thread/start', {
      ...(model ? { model } : {}),
      cwd: getCodexScratchDir(),
      approvalPolicy: 'never',
      sandbox: 'read-only',
      experimentalRawEvents: false,
      persistExtendedHistory: false,
    })

    const threadId = threadResult.thread.id
    let activeTurnId: string | null = null
    let imageResult: CodexImageResult | null = null

    const offItemCompleted = this.onNotification<CodexItemCompletedNotification>(
      'item/completed',
      (event) => {
        if (event.threadId !== threadId) return
        if (activeTurnId && event.turnId !== activeTurnId) return
        if (event.item.type !== 'imageGeneration' || !event.item.result) return
        imageResult = {
          base64: event.item.result,
          mimeType: 'image/png',
          savedPath: event.item.savedPath,
        }
      }
    )

    let offCompleted: () => void = () => {}
    let offExit: () => void = () => {}
    const turnCompleted = new Promise<void>((resolve, reject) => {
      offExit = this.onExit(reject)
      offCompleted = this.onNotification<CodexTurnCompletedNotification>(
        'turn/completed',
        (event) => {
          if (event.threadId !== threadId) return

          offCompleted()
          if (event.turn.status === 'failed') {
            reject(new Error(event.turn.error?.message ?? 'Codex image generation failed'))
            return
          }
          if (event.turn.status !== 'completed') {
            reject(new Error(`Codex image generation ended with status: ${event.turn.status}`))
            return
          }
          resolve()
        }
      )
    })

    const aspectRatio = params.aspectRatio ? ` Use aspect ratio ${params.aspectRatio}.` : ''
    const prompt = params.imageBase64
      ? `Edit the attached image according to this instruction.${aspectRatio}\n\n${params.prompt}`
      : `Generate one image from this prompt.${aspectRatio}\n\n${params.prompt}`
    const input: CodexUserInput[] = [{ type: 'text', text: prompt, text_elements: [] }]
    if (params.imageBase64) {
      const mimeType = params.imageMimeType || 'image/png'
      input.push({ type: 'image', url: `data:${mimeType};base64,${params.imageBase64}` })
    }

    const turnTimeoutMs = resolveTurnTimeout(params.turnTimeoutMs)
    const tracked = this.trackTurn(threadId, turnCompleted, turnTimeoutMs)
    turnCompleted.catch(() => {})

    try {
      const turnResult = await Promise.race([
        this.request<CodexTurnStartResponse>(
          'turn/start',
          {
            threadId,
            input,
            approvalPolicy: 'never',
            // Image generation is a built-in Codex tool; the sandboxed shell does not need the network.
            sandboxPolicy: { type: 'readOnly', networkAccess: false },
            ...(model ? { model } : {}),
          },
          turnTimeoutMs
        ),
        tracked.bounded.then(() => { throw new Error('Codex turn completed before it was acknowledged') }),
      ])
      activeTurnId = turnResult.turn.id
      tracked.setTurnId(turnResult.turn.id)

      await tracked.bounded
      if (!imageResult) {
        throw new Error('Codex completed without returning an image.')
      }
      return imageResult
    } finally {
      tracked.finish()
      offExit()
      offCompleted()
      offItemCompleted()
    }
  }
}

let sharedClient: CodexAppServerClient | null = null

export function getCodexAppServerClient(): CodexAppServerClient {
  if (!sharedClient) {
    sharedClient = new CodexAppServerClient()
  }
  return sharedClient
}
