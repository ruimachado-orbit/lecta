import type Anthropic from '@anthropic-ai/sdk'
import {
  CancelledError,
  throwIfAborted,
  withAbort,
  type GenerateRequest,
  type LLMAdapter,
  type ToolCall,
  type ToolCallResult,
  type ToolChatRequest,
  type ToolChatResult,
  type ToolChatState,
  type ToolSchema,
} from './types'

interface AnthropicToolChatState extends ToolChatState {
  readonly provider: 'anthropic'
  messages: Anthropic.MessageParam[]
}

function toAnthropicTools(tools: ToolSchema[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Tool.InputSchema,
  }))
}

function toolResultBlocks(results: ToolCallResult[]): Anthropic.ToolResultBlockParam[] {
  return results.map((r) => ({
    type: 'tool_result' as const,
    tool_use_id: r.id,
    content: r.result,
    is_error: r.isError,
  }))
}

/**
 * Anthropic Messages API adapter. Tool use is native: `tool_use` blocks come
 * back on the assistant turn and are paired with `tool_result` blocks on the
 * following user turn.
 */
export function createAnthropicAdapter(getClient: () => Promise<Anthropic>): LLMAdapter {
  const baseBody = (req: GenerateRequest): Omit<Anthropic.MessageCreateParamsNonStreaming, 'messages'> => ({
    model: req.model,
    max_tokens: req.maxTokens,
    system: req.system,
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
  })

  return {
    id: 'anthropic',

    async generate(req: GenerateRequest): Promise<string> {
      const client = await getClient()
      return withAbort(req.signal, async () => {
        const response = await client.messages.create(
          { ...baseBody(req), messages: req.messages },
          { signal: req.signal }
        )
        const textBlock = response.content.find((block) => block.type === 'text')
        return textBlock && textBlock.type === 'text' ? textBlock.text : ''
      })
    },

    async stream(req: GenerateRequest, onChunk: (t: string) => void): Promise<string> {
      const client = await getClient()
      return withAbort(req.signal, async () => {
        const stream = client.messages.stream(
          { ...baseBody(req), messages: req.messages },
          { signal: req.signal }
        )
        let full = ''
        for await (const event of stream) {
          if (req.signal?.aborted) throw new CancelledError()
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            full += event.delta.text
            onChunk(event.delta.text)
          }
        }
        return full
      })
    },

    async chatWithTools(req: ToolChatRequest): Promise<ToolChatResult> {
      throwIfAborted(req.signal)
      const client = await getClient()

      const prior = req.state as AnthropicToolChatState | undefined
      const messages: Anthropic.MessageParam[] = prior
        ? [...prior.messages]
        : req.messages.map((m) => ({ role: m.role, content: m.content }))

      // A tool_use block must always be answered by a matching tool_result block.
      if (req.toolResults?.length) {
        messages.push({ role: 'user', content: toolResultBlocks(req.toolResults) })
      }

      const response = await withAbort(req.signal, () =>
        client.messages.create(
          {
            ...baseBody(req),
            tools: toAnthropicTools(req.tools),
            messages,
          },
          { signal: req.signal }
        )
      )

      const assistantContent = response.content
      // A new array: the one just sent to the SDK must not be mutated behind it.
      const nextMessages: Anthropic.MessageParam[] = [
        ...messages,
        { role: 'assistant', content: assistantContent },
      ]

      const text = assistantContent
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')

      const toolCalls: ToolCall[] = assistantContent
        .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
        .map((b) => ({
          id: b.id,
          name: b.name,
          input: (b.input && typeof b.input === 'object' && !Array.isArray(b.input)
            ? b.input
            : {}) as Record<string, unknown>,
        }))

      const state: AnthropicToolChatState = { provider: 'anthropic', messages: nextMessages }
      return { text, toolCalls, state }
    },
  }
}
