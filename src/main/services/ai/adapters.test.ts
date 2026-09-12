import { describe, it, expect, vi } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import type OpenAI from 'openai'
import type { GoogleGenAI, FunctionDeclaration } from '@google/genai'
import type { CodexAppServerClient } from '../codex-app-server-client'
import { createAnthropicAdapter } from './anthropic'
import { createGeminiAdapter, toFunctionDeclarations } from './gemini'
import { createOpenAICompatibleAdapter } from './openai-compatible'
import { createCodexAdapter } from './codex'
import { runToolLoop, type LoopTool } from './tool-loop'
import { CANCELLED_MESSAGE, type GenerateRequest, type ToolSchema } from './types'
import type { ChatStreamEvent } from '../../../../packages/shared/src/types/chat'

const OBJECT_SCHEMA: ToolSchema = {
  name: 'edit_slide',
  description: 'Edit a slide',
  parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
}

const EMPTY_SCHEMA: ToolSchema = {
  name: 'get_info',
  description: 'Read the deck',
  parameters: { type: 'object', properties: {}, required: [] },
}

function baseRequest(overrides: Partial<GenerateRequest> = {}): GenerateRequest {
  return {
    model: 'test-model',
    system: 'be helpful',
    messages: [{ role: 'user', content: 'hello' }],
    maxTokens: 100,
    ...overrides,
  }
}

/** Collect the events the loop emits so assertions can read the whole turn. */
function recorder(): { events: ChatStreamEvent[]; onEvent: (e: ChatStreamEvent) => void } {
  const events: ChatStreamEvent[] = []
  return { events, onEvent: (e) => events.push(e) }
}

function loopTool(schema: ToolSchema, result = 'done', extra: Partial<LoopTool> = {}): LoopTool {
  return {
    schema,
    isMutation: true,
    execute: vi.fn(async () => ({ success: true, result })),
    ...extra,
  }
}

async function* asyncIterable<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item
}

// ── Anthropic ──

describe('anthropic adapter', () => {
  it('returns the first text block from a completion', async () => {
    const create = vi.fn(async () => ({ content: [{ type: 'text', text: 'hi there' }] }))
    const adapter = createAnthropicAdapter(async () => ({ messages: { create } }) as unknown as Anthropic)

    expect(await adapter.generate(baseRequest())).toBe('hi there')
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'test-model', max_tokens: 100, system: 'be helpful' }),
      expect.objectContaining({ signal: undefined })
    )
  })

  it('accumulates text deltas while streaming', async () => {
    const stream = vi.fn(() =>
      asyncIterable([
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ab' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'cd' } },
        { type: 'message_stop' },
      ])
    )
    const adapter = createAnthropicAdapter(async () => ({ messages: { stream } }) as unknown as Anthropic)

    const chunks: string[] = []
    expect(await adapter.stream(baseRequest(), (c) => chunks.push(c))).toBe('abcd')
    expect(chunks).toEqual(['ab', 'cd'])
  })

  it('pairs every tool_use block with a tool_result block on the next step', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        content: [
          { type: 'text', text: 'editing' },
          { type: 'tool_use', id: 'tu-1', name: 'edit_slide', input: { text: 'x' } },
        ],
      })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'all done' }] })
    const adapter = createAnthropicAdapter(async () => ({ messages: { create } }) as unknown as Anthropic)

    const { events, onEvent } = recorder()
    const result = await runToolLoop({
      adapter,
      request: baseRequest(),
      tools: [loopTool(OBJECT_SCHEMA, 'slide updated')],
      actionMode: 'auto',
      onEvent,
    })

    expect(result.text).toBe('editingall done')
    expect(result.iterations).toBe(2)

    const secondCall = create.mock.calls[1][0] as Anthropic.MessageCreateParamsNonStreaming
    const toolResultTurn = secondCall.messages[secondCall.messages.length - 1]
    expect(toolResultTurn.role).toBe('user')
    expect(toolResultTurn.content).toEqual([
      { type: 'tool_result', tool_use_id: 'tu-1', content: 'slide updated', is_error: false },
    ])
    // The assistant turn carrying the tool_use must still precede it.
    expect(secondCall.messages[secondCall.messages.length - 2].role).toBe('assistant')

    expect(events.map((e) => e.type)).toEqual([
      'text_delta',
      'tool_call_start',
      'tool_call_result',
      'text_delta',
    ])
  })

  it('rejects with Cancelled when the signal is already aborted', async () => {
    const create = vi.fn()
    const adapter = createAnthropicAdapter(async () => ({ messages: { create } }) as unknown as Anthropic)
    const controller = new AbortController()
    controller.abort()

    await expect(adapter.generate(baseRequest({ signal: controller.signal }))).rejects.toThrow(CANCELLED_MESSAGE)
    expect(create).not.toHaveBeenCalled()
  })

  it('reports an SDK abort error as Cancelled', async () => {
    const controller = new AbortController()
    const create = vi.fn(async () => {
      controller.abort()
      throw new Error('Request was aborted.')
    })
    const adapter = createAnthropicAdapter(async () => ({ messages: { create } }) as unknown as Anthropic)

    await expect(adapter.generate(baseRequest({ signal: controller.signal }))).rejects.toThrow(CANCELLED_MESSAGE)
  })

  it('stops a stream with Cancelled when the signal aborts mid-flight', async () => {
    const controller = new AbortController()
    const stream = vi.fn(() =>
      asyncIterable([
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'first' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'second' } },
      ])
    )
    const adapter = createAnthropicAdapter(async () => ({ messages: { stream } }) as unknown as Anthropic)

    const chunks: string[] = []
    await expect(
      adapter.stream(baseRequest({ signal: controller.signal }), (c) => {
        chunks.push(c)
        controller.abort()
      })
    ).rejects.toThrow(CANCELLED_MESSAGE)
    expect(chunks).toEqual(['first'])
  })
})

// ── OpenAI-compatible ──

function openaiClient(responses: unknown[]): { client: OpenAI; create: ReturnType<typeof vi.fn> } {
  const create = vi.fn(async () => responses.shift())
  return { client: { chat: { completions: { create } } } as unknown as OpenAI, create }
}

describe('openai-compatible adapter', () => {
  it('uses max_completion_tokens for OpenAI and max_tokens elsewhere', async () => {
    const openai = openaiClient([{ choices: [{ message: { content: 'a' } }] }])
    await createOpenAICompatibleAdapter({
      id: 'openai',
      getClient: async () => openai.client,
      tokenParam: 'max_completion_tokens',
    }).generate(baseRequest())
    expect(openai.create.mock.calls[0][0]).toMatchObject({ max_completion_tokens: 100 })
    expect(openai.create.mock.calls[0][0]).not.toHaveProperty('max_tokens')

    const mistral = openaiClient([{ choices: [{ message: { content: 'b' } }] }])
    await createOpenAICompatibleAdapter({
      id: 'mistral',
      getClient: async () => mistral.client,
      tokenParam: 'max_tokens',
    }).generate(baseRequest())
    expect(mistral.create.mock.calls[0][0]).toMatchObject({ max_tokens: 100 })
    expect(mistral.create.mock.calls[0][0]).not.toHaveProperty('max_completion_tokens')
  })

  it('merges the system prompt into the user turn for reasoning models', async () => {
    const openai = openaiClient([{ choices: [{ message: { content: 'ok' } }] }])
    await createOpenAICompatibleAdapter({
      id: 'openai',
      getClient: async () => openai.client,
      tokenParam: 'max_completion_tokens',
      reasoningModelPattern: /^(o[1-9]|o\d+-mini)/,
    }).generate(baseRequest({ model: 'o3' }))

    expect(openai.create.mock.calls[0][0].messages).toEqual([
      { role: 'user', content: 'be helpful\n\nhello' },
    ])
  })

  it('strips the ollama: routing prefix from the wire model id', async () => {
    const ollama = openaiClient([{ choices: [{ message: { content: 'ok' } }] }])
    await createOpenAICompatibleAdapter({
      id: 'ollama',
      getClient: async () => ollama.client,
      tokenParam: 'max_tokens',
      requestModelId: (m) => m.replace(/^ollama:/, ''),
    }).generate(baseRequest({ model: 'ollama:llama3.2' }))

    expect(ollama.create.mock.calls[0][0].model).toBe('llama3.2')
  })

  it('keeps looping when finish_reason is "stop" but tool_calls came back', async () => {
    const openai = openaiClient([
      {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: 'working on it',
              tool_calls: [
                { id: 'call-1', type: 'function', function: { name: 'edit_slide', arguments: '{"text":"x"}' } },
              ],
            },
          },
        ],
      },
      { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'finished' } }] },
    ])
    const adapter = createOpenAICompatibleAdapter({
      id: 'mistral',
      getClient: async () => openai.client,
      tokenParam: 'max_tokens',
    })

    const { events, onEvent } = recorder()
    const tool = loopTool(OBJECT_SCHEMA, 'slide updated')
    const result = await runToolLoop({
      adapter,
      request: baseRequest(),
      tools: [tool],
      actionMode: 'auto',
      onEvent,
    })

    expect(result.iterations).toBe(2)
    expect(result.text).toBe('working on itfinished')
    expect(tool.execute).toHaveBeenCalledWith({ text: 'x' })

    // The tool_call is answered by a tool message carrying the same id.
    const secondMessages = openai.create.mock.calls[1][0].messages as OpenAI.ChatCompletionMessageParam[]
    expect(secondMessages[secondMessages.length - 1]).toEqual({
      role: 'tool',
      tool_call_id: 'call-1',
      content: 'slide updated',
    })
    expect(events.some((e) => e.type === 'tool_call_start' && e.id === 'call-1')).toBe(true)
  })

  it('turns an argument-parse failure into a tool message instead of a tool call', async () => {
    const openai = openaiClient([
      {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                { id: 'call-bad', type: 'function', function: { name: 'edit_slide', arguments: '{oops' } },
              ],
            },
          },
        ],
      },
      { choices: [{ message: { role: 'assistant', content: 'recovered' } }] },
    ])
    const adapter = createOpenAICompatibleAdapter({
      id: 'xai',
      getClient: async () => openai.client,
      tokenParam: 'max_tokens',
    })

    const step = await adapter.chatWithTools({ ...baseRequest(), tools: [OBJECT_SCHEMA] })
    expect(step.toolCalls).toEqual([])
    expect(step.argumentErrors).toHaveLength(1)
    expect(step.argumentErrors?.[0]).toMatchObject({ id: 'call-bad', name: 'edit_slide' })
    expect(step.argumentErrors?.[0].message).toContain('Invalid JSON in tool arguments')

    // The failure is paired back so the next request is not left with a dangling tool_call.
    const messages = (step.state as unknown as { messages: OpenAI.ChatCompletionMessageParam[] }).messages
    const last = messages[messages.length - 1]
    expect(last).toMatchObject({ role: 'tool', tool_call_id: 'call-bad' })
  })

  it('gives the model another turn to recover from a parse failure', async () => {
    const openai = openaiClient([
      {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                { id: 'call-bad', type: 'function', function: { name: 'edit_slide', arguments: 'not json' } },
              ],
            },
          },
        ],
      },
      { choices: [{ message: { role: 'assistant', content: 'sorry about that' } }] },
    ])
    const adapter = createOpenAICompatibleAdapter({
      id: 'xai',
      getClient: async () => openai.client,
      tokenParam: 'max_tokens',
    })

    const { events, onEvent } = recorder()
    const result = await runToolLoop({
      adapter,
      request: baseRequest(),
      tools: [loopTool(OBJECT_SCHEMA)],
      actionMode: 'auto',
      onEvent,
    })

    expect(result.iterations).toBe(2)
    expect(result.text).toBe('sorry about that')
    const failure = events.find((e) => e.type === 'tool_call_result')
    expect(failure).toMatchObject({ id: 'call-bad', success: false })
  })

  it('rejects with Cancelled when aborted', async () => {
    const openai = openaiClient([])
    const adapter = createOpenAICompatibleAdapter({
      id: 'perplexity',
      getClient: async () => openai.client,
      tokenParam: 'max_tokens',
    })
    const controller = new AbortController()
    controller.abort()

    await expect(adapter.generate(baseRequest({ signal: controller.signal }))).rejects.toThrow(CANCELLED_MESSAGE)
    await expect(
      adapter.chatWithTools({ ...baseRequest({ signal: controller.signal }), tools: [OBJECT_SCHEMA] })
    ).rejects.toThrow(CANCELLED_MESSAGE)
    expect(openai.create).not.toHaveBeenCalled()
  })
})

// ── Gemini ──

describe('gemini adapter', () => {
  it('omits `parameters` for a tool with no properties and keeps it otherwise', () => {
    const declarations = toFunctionDeclarations([EMPTY_SCHEMA, OBJECT_SCHEMA])

    expect(declarations[0]).toEqual({ name: 'get_info', description: 'Read the deck' })
    expect(declarations[0]).not.toHaveProperty('parameters')
    expect(declarations[1]).toHaveProperty('parameters', OBJECT_SCHEMA.parameters)
  })

  it('sends function declarations without empty parameters through chatWithTools', async () => {
    type GeminiCall = { config: { tools: { functionDeclarations: FunctionDeclaration[] }[] } }
    const generateContent = vi.fn(async (_params: GeminiCall) => ({
      candidates: [{ content: { parts: [{ text: 'nothing to do' }] } }],
    }))
    const adapter = createGeminiAdapter(
      async () => ({ models: { generateContent } }) as unknown as GoogleGenAI
    )

    await adapter.chatWithTools({ ...baseRequest(), tools: [EMPTY_SCHEMA] })

    const declarations = generateContent.mock.calls[0][0].config.tools[0].functionDeclarations
    expect(declarations[0]).not.toHaveProperty('parameters')
  })

  it('pairs functionCall parts with functionResponse parts', async () => {
    const generateContent = vi
      .fn()
      .mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [
                { text: 'let me edit' },
                { functionCall: { id: 'fc-1', name: 'edit_slide', args: { text: 'y' } } },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({ candidates: [{ content: { parts: [{ text: 'done' }] } }] })
    const adapter = createGeminiAdapter(
      async () => ({ models: { generateContent } }) as unknown as GoogleGenAI
    )

    const { onEvent } = recorder()
    const result = await runToolLoop({
      adapter,
      request: baseRequest(),
      tools: [loopTool(OBJECT_SCHEMA, 'edited')],
      actionMode: 'auto',
      onEvent,
    })

    expect(result.text).toBe('let me editdone')
    const secondContents = generateContent.mock.calls[1][0].contents
    expect(secondContents[secondContents.length - 1]).toEqual({
      role: 'user',
      parts: [{ functionResponse: { name: 'edit_slide', response: { result: 'edited', isError: false } } }],
    })
    // The model turn holding the functionCall is preserved before the response.
    expect(secondContents[secondContents.length - 2].role).toBe('model')
  })

  it('rejects with Cancelled when aborted', async () => {
    const generateContent = vi.fn()
    const adapter = createGeminiAdapter(
      async () => ({ models: { generateContent } }) as unknown as GoogleGenAI
    )
    const controller = new AbortController()
    controller.abort()

    await expect(adapter.generate(baseRequest({ signal: controller.signal }))).rejects.toThrow(CANCELLED_MESSAGE)
    expect(generateContent).not.toHaveBeenCalled()
  })
})

// ── Codex ──

describe('codex adapter', () => {
  it('drives tool calls itself and reports no toolCalls to the loop', async () => {
    const execute = vi.fn(async () => ({ success: true, result: 'slide updated' }))
    const streamText = vi.fn(async (params: Parameters<CodexAppServerClient['streamText']>[0]) => {
      params.onChunk('partial ')
      await params.onDynamicToolCall?.({
        threadId: 't', turnId: 'u', callId: 'call-9', tool: 'edit_slide', arguments: { text: 'z' },
      })
      params.onChunk('answer')
      return 'partial answer'
    })
    const adapter = createCodexAdapter({
      getClient: () => ({ streamText, cancelTurn: vi.fn() }) as unknown as CodexAppServerClient,
    })

    const { events, onEvent } = recorder()
    const result = await runToolLoop({
      adapter,
      request: baseRequest(),
      tools: [loopTool(OBJECT_SCHEMA, 'slide updated', { execute })],
      actionMode: 'auto',
      onEvent,
    })

    expect(result.iterations).toBe(1)
    expect(result.text).toBe('partial answer')
    expect(execute).toHaveBeenCalledWith({ text: 'z' })
    // Streamed text must not be emitted twice.
    expect(events.filter((e) => e.type === 'text_delta').map((e) => e.text)).toEqual(['partial ', 'answer'])
    expect(streamText.mock.calls[0][0].dynamicTools).toEqual([
      { name: 'edit_slide', description: 'Edit a slide', inputSchema: OBJECT_SCHEMA.parameters },
    ])
  })

  it('interrupts the turn and rejects with Cancelled when aborted mid-turn', async () => {
    const cancelTurn = vi.fn(async () => {})
    const streamText = vi.fn(() => new Promise<string>(() => {}))
    const adapter = createCodexAdapter({
      getClient: () => ({ streamText, cancelTurn }) as unknown as CodexAppServerClient,
    })

    const controller = new AbortController()
    const pending = adapter.stream(baseRequest({ signal: controller.signal }), () => {})
    controller.abort()

    await expect(pending).rejects.toThrow(CANCELLED_MESSAGE)
    expect(cancelTurn).toHaveBeenCalled()
  })
})

// ── Tool loop ──

describe('tool loop', () => {
  /** Adapter that always asks for the same tool, so the iteration cap is what stops it. */
  function loopingAdapter(): ReturnType<typeof createAnthropicAdapter> {
    const create = vi.fn(async () => ({
      content: [{ type: 'tool_use', id: `tu-${create.mock.calls.length}`, name: 'edit_slide', input: {} }],
    }))
    return createAnthropicAdapter(async () => ({ messages: { create } }) as unknown as Anthropic)
  }

  it('stops after 10 iterations', async () => {
    const { onEvent } = recorder()
    const result = await runToolLoop({
      adapter: loopingAdapter(),
      request: baseRequest(),
      tools: [loopTool(OBJECT_SCHEMA)],
      actionMode: 'auto',
      onEvent,
    })
    expect(result.iterations).toBe(10)
  })

  it('gates alwaysConfirm tools even in auto mode and skips the call when rejected', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'tu-1', name: 'edit_slide', input: { text: 'x' } }],
      })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'ok, skipped' }] })
    const adapter = createAnthropicAdapter(async () => ({ messages: { create } }) as unknown as Anthropic)

    const tool = loopTool(OBJECT_SCHEMA, 'deleted', { alwaysConfirm: true })
    const confirmAction = vi.fn(async () => false)
    const { events, onEvent } = recorder()

    await runToolLoop({
      adapter,
      request: baseRequest(),
      tools: [tool],
      actionMode: 'auto',
      onEvent,
      confirmAction,
    })

    expect(confirmAction).toHaveBeenCalledWith('tu-1', 'edit_slide', { text: 'x' })
    expect(tool.execute).not.toHaveBeenCalled()
    expect(events.some((e) => e.type === 'tool_confirm_request')).toBe(true)
    // The rejection is still paired back to the model as a tool result.
    const toolResultTurn = (create.mock.calls[1][0] as Anthropic.MessageCreateParamsNonStreaming).messages.at(-1)
    expect(toolResultTurn?.content).toEqual([
      { type: 'tool_result', tool_use_id: 'tu-1', content: 'Action was rejected by the user.', is_error: false },
    ])
  })

  it('does not gate a read-only tool in ask mode', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'tu-1', name: 'get_info', input: {} }],
      })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'here you go' }] })
    const adapter = createAnthropicAdapter(async () => ({ messages: { create } }) as unknown as Anthropic)

    const tool = loopTool(EMPTY_SCHEMA, 'info', { isMutation: false })
    const confirmAction = vi.fn(async () => true)

    await runToolLoop({
      adapter,
      request: baseRequest(),
      tools: [tool],
      actionMode: 'ask',
      onEvent: () => {},
      confirmAction,
    })

    expect(confirmAction).not.toHaveBeenCalled()
    expect(tool.execute).toHaveBeenCalled()
  })

  it('reports an unknown tool back to the model instead of throwing', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'tu-1', name: 'nope', input: {} }],
      })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'understood' }] })
    const adapter = createAnthropicAdapter(async () => ({ messages: { create } }) as unknown as Anthropic)

    const { events, onEvent } = recorder()
    const result = await runToolLoop({
      adapter,
      request: baseRequest(),
      tools: [loopTool(OBJECT_SCHEMA)],
      actionMode: 'auto',
      onEvent,
    })

    expect(result.text).toBe('understood')
    expect(events.find((e) => e.type === 'tool_call_result')).toMatchObject({
      result: 'Unknown tool: nope',
      success: false,
    })
  })

  it('surfaces a throwing tool as a failed tool result', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'tu-1', name: 'edit_slide', input: { text: 'x' } }],
      })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'noted' }] })
    const adapter = createAnthropicAdapter(async () => ({ messages: { create } }) as unknown as Anthropic)

    const tool: LoopTool = {
      schema: OBJECT_SCHEMA,
      isMutation: true,
      execute: async () => { throw new Error('disk on fire') },
    }
    const { events, onEvent } = recorder()

    await runToolLoop({ adapter, request: baseRequest(), tools: [tool], actionMode: 'auto', onEvent })

    expect(events.find((e) => e.type === 'tool_call_result')).toMatchObject({
      result: 'Tool execution error: disk on fire',
      success: false,
    })
  })

  it('rejects with Cancelled when the signal aborts between steps', async () => {
    const controller = new AbortController()
    const create = vi.fn(async () => {
      controller.abort()
      return { content: [{ type: 'tool_use', id: 'tu-1', name: 'edit_slide', input: {} }] }
    })
    const adapter = createAnthropicAdapter(async () => ({ messages: { create } }) as unknown as Anthropic)

    await expect(
      runToolLoop({
        adapter,
        request: baseRequest({ signal: controller.signal }),
        tools: [loopTool(OBJECT_SCHEMA)],
        actionMode: 'auto',
        onEvent: () => {},
      })
    ).rejects.toThrow(CANCELLED_MESSAGE)
  })
})
