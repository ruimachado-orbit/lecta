import type { ChatStreamEvent, RendererAction } from '../../../../packages/shared/src/types/chat'
import {
  throwIfAborted,
  type GenerateRequest,
  type LLMAdapter,
  type ToolCall,
  type ToolCallResult,
  type ToolChatState,
  type ToolSchema,
} from './types'

/** Default cap on model↔tool round trips for a single user turn. */
export const MAX_TOOL_ITERATIONS = 10

/** A tool the loop may run, with the gating flags that decide confirmation. */
export interface LoopTool {
  schema: ToolSchema
  /** Whether the tool changes the deck (gated in `ask` mode). */
  isMutation: boolean
  /** Destructive or multi-slide tools: always gated, even in `auto` mode. */
  alwaysConfirm?: boolean
  execute: (input: Record<string, unknown>) => Promise<{
    success: boolean
    result: string
    rendererAction?: RendererAction
  }>
}

export interface ToolLoopParams {
  adapter: LLMAdapter
  /** Prompt, history and limits for every step of the loop. */
  request: GenerateRequest
  tools: LoopTool[]
  actionMode: 'auto' | 'ask'
  onEvent: (event: ChatStreamEvent) => void
  confirmAction?: (toolCallId: string, toolName: string, toolInput: unknown) => Promise<boolean>
  maxIterations?: number
}

export interface ToolLoopResult {
  /** Everything the assistant said across the whole turn. */
  text: string
  iterations: number
}

/**
 * One provider-neutral ReAct loop for every adapter: it asks for a step, gates
 * and runs the tools that came back, pairs every call with its result, and
 * asks again — until the model stops calling tools, the cap is reached, or the
 * caller aborts.
 */
export async function runToolLoop(params: ToolLoopParams): Promise<ToolLoopResult> {
  const { adapter, request, tools, actionMode, onEvent, confirmAction } = params
  const maxIterations = params.maxIterations ?? MAX_TOOL_ITERATIONS
  const signal = request.signal
  const byName = new Map(tools.map((t) => [t.schema.name, t]))
  const schemas: ToolSchema[] = tools.map((t) => t.schema)

  /** Emit events, apply the confirmation gate, and run one tool call. */
  const executeTool = async (call: ToolCall): Promise<{ result: string; isError: boolean }> => {
    const tool = byName.get(call.name)
    if (!tool) {
      const message = `Unknown tool: ${call.name}`
      onEvent({ type: 'tool_call_result', id: call.id, toolName: call.name, result: message, success: false })
      return { result: message, isError: true }
    }

    onEvent({ type: 'tool_call_start', id: call.id, toolName: call.name, toolInput: call.input })

    const needsConfirmation = tool.alwaysConfirm === true || (actionMode === 'ask' && tool.isMutation)
    if (needsConfirmation) {
      if (!confirmAction) {
        const message = `"${call.name}" requires user confirmation, which is not available in this session.`
        onEvent({ type: 'tool_call_result', id: call.id, toolName: call.name, result: message, success: false })
        return { result: message, isError: true }
      }
      onEvent({ type: 'tool_confirm_request', id: call.id, toolName: call.name, toolInput: call.input })
      const approved = await confirmAction(call.id, call.name, call.input)
      if (!approved) {
        onEvent({ type: 'tool_call_result', id: call.id, toolName: call.name, result: 'Action rejected by user.', success: false })
        return { result: 'Action was rejected by the user.', isError: false }
      }
    }

    try {
      const outcome = await tool.execute(call.input)
      onEvent({
        type: 'tool_call_result',
        id: call.id,
        toolName: call.name,
        result: outcome.result,
        success: outcome.success,
        ...(outcome.rendererAction ? { rendererAction: outcome.rendererAction } : {}),
      })
      return { result: outcome.result, isError: !outcome.success }
    } catch (err) {
      const message = `Tool execution error: ${(err as Error).message}`
      onEvent({ type: 'tool_call_result', id: call.id, toolName: call.name, result: message, success: false })
      return { result: message, isError: true }
    }
  }

  let state: ToolChatState | undefined
  let toolResults: ToolCallResult[] | undefined
  let fullText = ''
  let iterations = 0

  while (iterations < maxIterations) {
    iterations++
    throwIfAborted(signal)

    const step = await adapter.chatWithTools({
      ...request,
      tools: schemas,
      ...(state ? { state } : {}),
      ...(toolResults ? { toolResults } : {}),
      onText: (chunk) => onEvent({ type: 'text_delta', text: chunk }),
      executeTool,
    })

    state = step.state
    if (step.text) {
      fullText += step.text
      // Adapters that already streamed through `onText` must not emit twice.
      if (!step.textStreamed) onEvent({ type: 'text_delta', text: step.text })
    }

    const argumentErrors = step.argumentErrors ?? []
    for (const failure of argumentErrors) {
      onEvent({ type: 'tool_call_result', id: failure.id, toolName: failure.name, result: failure.message, success: false })
    }

    // The adapter has already paired the failed calls with tool messages, so a
    // step with only parse failures still gets another turn to recover.
    if (step.toolCalls.length === 0) {
      if (argumentErrors.length === 0) break
      toolResults = []
      continue
    }

    const results: ToolCallResult[] = []
    for (const call of step.toolCalls) {
      throwIfAborted(signal)
      const outcome = await executeTool(call)
      results.push({ id: call.id, name: call.name, result: outcome.result, isError: outcome.isError })
    }
    toolResults = results
  }

  return { text: fullText, iterations }
}
