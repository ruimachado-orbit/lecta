import type { CodexAppServerClient, CodexDynamicToolSpec } from '../codex-app-server-client'
import {
  CancelledError,
  throwIfAborted,
  type GenerateRequest,
  type LLMAdapter,
  type ToolChatRequest,
  type ToolChatResult,
  type ToolChatState,
} from './types'

export interface CodexAdapterOptions {
  getClient: () => CodexAppServerClient
  /** Whole-turn bound handed to the app-server client. */
  turnTimeoutMs?: number
}

interface CodexToolChatState extends ToolChatState {
  readonly provider: 'openai'
}

/** Flatten the conversation into the single prompt the Codex app-server takes. */
function conversationText(messages: { role: 'user' | 'assistant'; content: string }[]): string {
  return messages.map((m) => `${m.role.toUpperCase()}:\n${m.content}`).join('\n\n')
}

/**
 * Codex (ChatGPT subscription auth) adapter over the app-server client.
 *
 * Codex drives tool calls itself over JSON-RPC, so `chatWithTools` runs the
 * whole turn in one step and returns no `toolCalls`: the generic tool loop
 * therefore stops after a single iteration.
 */
export function createCodexAdapter(options: CodexAdapterOptions): LLMAdapter {
  const { getClient, turnTimeoutMs } = options

  /**
   * Run a Codex turn under an AbortSignal: aborting interrupts the turn on the
   * app-server and rejects with the shared `Cancelled` error.
   */
  async function runTurn(
    signal: AbortSignal | undefined,
    work: (client: CodexAppServerClient) => Promise<string>
  ): Promise<string> {
    throwIfAborted(signal)
    const client = getClient()

    let onAbort: (() => void) | undefined
    const aborted = signal
      ? new Promise<never>((_resolve, reject) => {
          onAbort = () => {
            void client.cancelTurn().catch(() => {})
            reject(new CancelledError())
          }
          signal.addEventListener('abort', onAbort, { once: true })
        })
      : null

    try {
      const turn = work(client)
      return aborted ? await Promise.race([turn, aborted]) : await turn
    } catch (err) {
      if (signal?.aborted) throw new CancelledError()
      throw err
    } finally {
      if (signal && onAbort) signal.removeEventListener('abort', onAbort)
    }
  }

  return {
    id: 'openai',

    async generate(req: GenerateRequest): Promise<string> {
      return runTurn(req.signal, (client) =>
        client.streamText({
          system: req.system,
          userMessage: conversationText(req.messages),
          model: req.model,
          onChunk: () => {},
          ...(turnTimeoutMs ? { turnTimeoutMs } : {}),
        })
      )
    },

    async stream(req: GenerateRequest, onChunk: (t: string) => void): Promise<string> {
      return runTurn(req.signal, (client) =>
        client.streamText({
          system: req.system,
          userMessage: conversationText(req.messages),
          model: req.model,
          onChunk,
          ...(turnTimeoutMs ? { turnTimeoutMs } : {}),
        })
      )
    },

    async chatWithTools(req: ToolChatRequest): Promise<ToolChatResult> {
      const dynamicTools: CodexDynamicToolSpec[] = req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.parameters,
      }))

      const executeTool = req.executeTool
      const text = await runTurn(req.signal, (client) =>
        client.streamText({
          system: req.system,
          userMessage: conversationText(req.messages),
          model: req.model,
          dynamicTools,
          onDynamicToolCall: async (call) => {
            if (!executeTool) {
              return { contentItems: [{ type: 'inputText', text: 'Tool execution is unavailable.' }], success: false }
            }
            const input =
              call.arguments && typeof call.arguments === 'object' && !Array.isArray(call.arguments)
                ? (call.arguments as Record<string, unknown>)
                : {}
            const { result, isError } = await executeTool({ id: call.callId, name: call.tool, input })
            return { contentItems: [{ type: 'inputText', text: result }], success: !isError }
          },
          onChunk: (chunk) => req.onText?.(chunk),
          finalInstruction:
            'Use the available tools when a request requires inspecting or changing the presentation. After any necessary tool calls, respond concisely with what you did.',
          ...(turnTimeoutMs ? { turnTimeoutMs } : {}),
        })
      )

      const state: CodexToolChatState = { provider: 'openai' }
      return { text, toolCalls: [], state, textStreamed: true }
    },
  }
}
