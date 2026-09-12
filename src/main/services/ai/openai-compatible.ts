import type OpenAI from 'openai'
import {
  CancelledError,
  throwIfAborted,
  withAbort,
  type GenerateRequest,
  type LLMAdapter,
  type ProviderId,
  type ToolArgumentError,
  type ToolCall,
  type ToolChatRequest,
  type ToolChatResult,
  type ToolChatState,
  type ToolSchema,
} from './types'

/**
 * GPT-5 and the o-series reject `max_tokens`; every other OpenAI-compatible
 * server (Mistral, Llama, xAI, Perplexity, Ollama) only understands `max_tokens`.
 */
export type TokenParam = 'max_tokens' | 'max_completion_tokens'

export interface OpenAICompatibleOptions {
  id: ProviderId
  getClient: () => Promise<OpenAI>
  tokenParam: TokenParam
  /**
   * Models that reject a `system` message and `tool_choice` (OpenAI's o-series).
   * The system prompt is merged into the first user turn instead.
   */
  reasoningModelPattern?: RegExp
  /** Maps the catalog model id onto the id the server expects (Ollama strips its prefix). */
  requestModelId?: (model: string) => string
}

interface OpenAIToolChatState extends ToolChatState {
  messages: OpenAI.ChatCompletionMessageParam[]
}

function toOpenAITools(tools: ToolSchema[]): OpenAI.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))
}

/**
 * Chat Completions adapter, parameterised by base URL (through the injected
 * client) and by which max-token parameter the server accepts.
 */
export function createOpenAICompatibleAdapter(options: OpenAICompatibleOptions): LLMAdapter {
  const { id, getClient, tokenParam, reasoningModelPattern } = options
  const modelId = options.requestModelId ?? ((m: string) => m)

  const isReasoning = (model: string): boolean => !!reasoningModelPattern?.test(model)

  const tokenBody = (maxTokens: number): Record<string, number> =>
    tokenParam === 'max_completion_tokens'
      ? { max_completion_tokens: maxTokens }
      : { max_tokens: maxTokens }

  /** Plain (non-tool) prompt: a system turn plus the conversation. */
  const flatMessages = (req: GenerateRequest): OpenAI.ChatCompletionMessageParam[] => {
    if (isReasoning(req.model)) {
      const merged = [req.system, ...req.messages.map((m) => m.content)].join('\n\n')
      return [{ role: 'user', content: merged }]
    }
    return [
      { role: 'system', content: req.system },
      ...req.messages.map((m) =>
        m.role === 'assistant'
          ? ({ role: 'assistant', content: m.content } as OpenAI.ChatCompletionMessageParam)
          : ({ role: 'user', content: m.content } as OpenAI.ChatCompletionMessageParam)
      ),
    ]
  }

  return {
    id,

    async generate(req: GenerateRequest): Promise<string> {
      const client = await getClient()
      return withAbort(req.signal, async () => {
        const response = await client.chat.completions.create(
          {
            model: modelId(req.model),
            ...tokenBody(req.maxTokens),
            ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
            messages: flatMessages(req),
          },
          { signal: req.signal }
        )
        return response.choices[0]?.message?.content ?? ''
      })
    },

    async stream(req: GenerateRequest, onChunk: (t: string) => void): Promise<string> {
      const client = await getClient()
      return withAbort(req.signal, async () => {
        const stream = await client.chat.completions.create(
          {
            model: modelId(req.model),
            ...tokenBody(req.maxTokens),
            ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
            messages: flatMessages(req),
            stream: true,
          },
          { signal: req.signal }
        )
        let full = ''
        for await (const chunk of stream) {
          if (req.signal?.aborted) throw new CancelledError()
          const delta = chunk.choices[0]?.delta?.content
          if (delta) {
            full += delta
            onChunk(delta)
          }
        }
        return full
      })
    },

    async chatWithTools(req: ToolChatRequest): Promise<ToolChatResult> {
      throwIfAborted(req.signal)
      const client = await getClient()
      const reasoning = isReasoning(req.model)

      const prior = req.state as OpenAIToolChatState | undefined
      const messages: OpenAI.ChatCompletionMessageParam[] = prior
        ? [...prior.messages]
        : flatMessages(req)

      // Each tool_call must be answered by a tool message with the same id.
      for (const result of req.toolResults ?? []) {
        messages.push({ role: 'tool', tool_call_id: result.id, content: result.result })
      }

      const response = await withAbort(req.signal, () =>
        client.chat.completions.create(
          {
            model: modelId(req.model),
            ...tokenBody(req.maxTokens),
            ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
            messages,
            tools: toOpenAITools(req.tools),
            ...(reasoning ? {} : { tool_choice: 'auto' as const }),
          },
          { signal: req.signal }
        )
      )

      const assistantMsg = response.choices[0]?.message
      if (!assistantMsg) {
        return { text: '', toolCalls: [], state: { provider: id, messages } as OpenAIToolChatState }
      }

      // A new array: the one just sent to the SDK must not be mutated behind it.
      const nextMessages: OpenAI.ChatCompletionMessageParam[] = [...messages, assistantMsg]

      const toolCalls: ToolCall[] = []
      const argumentErrors: ToolArgumentError[] = []

      // Some servers report finish_reason "stop" alongside tool calls — trust the calls.
      for (const tc of assistantMsg.tool_calls ?? []) {
        if (tc.type !== 'function') continue
        let parsedInput: Record<string, unknown>
        try {
          const parsed: unknown = JSON.parse(tc.function.arguments || '{}')
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('arguments must be a JSON object')
          }
          parsedInput = parsed as Record<string, unknown>
        } catch (parseErr) {
          const message = `Invalid JSON in tool arguments for ${tc.function.name}: ${(parseErr as Error).message}`
          // Answer the call anyway: an unpaired tool_call breaks the next request.
          nextMessages.push({ role: 'tool', tool_call_id: tc.id, content: message })
          argumentErrors.push({ id: tc.id, name: tc.function.name, message })
          continue
        }
        toolCalls.push({ id: tc.id, name: tc.function.name, input: parsedInput })
      }

      const state: OpenAIToolChatState = { provider: id, messages: nextMessages }
      return {
        text: assistantMsg.content ?? '',
        toolCalls,
        ...(argumentErrors.length > 0 ? { argumentErrors } : {}),
        state,
      }
    },
  }
}
