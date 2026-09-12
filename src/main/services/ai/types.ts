import type { AIProviderID } from '../../../../packages/shared/src/constants'

/** Provider that an adapter speaks for. Mirrors the shared catalog ids. */
export type ProviderId = AIProviderID

/** A JSON Schema object describing a tool's input. */
export type JSONSchema = Record<string, unknown>

/** One turn of the normalized conversation handed to an adapter. */
export interface AdapterMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Everything an adapter needs for a single text completion. */
export interface GenerateRequest {
  model: string
  system: string
  messages: AdapterMessage[]
  maxTokens: number
  temperature?: number
  signal?: AbortSignal
}

/** Provider-neutral tool definition: a name, a description and a JSON schema. */
export interface ToolSchema {
  name: string
  description: string
  /** JSON Schema for the tool input — always an object schema. */
  parameters: JSONSchema
}

/** A tool the model asked to run. */
export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

/** The outcome of running a tool, fed back to the model on the next step. */
export interface ToolCallResult {
  id: string
  name: string
  result: string
  isError: boolean
}

/** A tool call whose arguments could not be parsed; reported back as a tool message. */
export interface ToolArgumentError {
  id: string
  name: string
  message: string
}

/**
 * Opaque, provider-native conversation state threaded through the tool loop.
 * Only the adapter that produced it may read it.
 */
export interface ToolChatState {
  readonly provider: ProviderId
}

/** One step of a tool-using conversation. */
export interface ToolChatRequest extends GenerateRequest {
  tools: ToolSchema[]
  /** State returned by the previous step; omitted on the first step. */
  state?: ToolChatState
  /** Results for the tool calls the previous step returned. */
  toolResults?: ToolCallResult[]
  /** Called with streamed text as it arrives (adapters that stream set `textStreamed`). */
  onText?: (chunk: string) => void
  /**
   * Gated tool executor supplied by the tool loop. Only adapters whose
   * transport drives tool calls itself (Codex) use it; they run the whole turn
   * and return no `toolCalls`, so the loop stops after one step.
   */
  executeTool?: (call: ToolCall) => Promise<{ result: string; isError: boolean }>
}

/** What one tool-chat step produced. */
export interface ToolChatResult {
  text: string
  toolCalls: ToolCall[]
  /** Calls rejected before execution because their arguments were not valid JSON. */
  argumentErrors?: ToolArgumentError[]
  state: ToolChatState
  /** True when the adapter already delivered `text` through `onText`. */
  textStreamed?: boolean
}

/** The single provider abstraction the rest of the app talks to. */
export interface LLMAdapter {
  readonly id: ProviderId
  generate(req: GenerateRequest): Promise<string>
  stream(req: GenerateRequest, onChunk: (t: string) => void): Promise<string>
  chatWithTools(req: ToolChatRequest): Promise<ToolChatResult>
}

/** Message used for every cancellation, whatever the provider. */
export const CANCELLED_MESSAGE = 'Cancelled'

/** Thrown when a request is aborted through its `AbortSignal`. */
export class CancelledError extends Error {
  constructor() {
    super(CANCELLED_MESSAGE)
    this.name = 'CancelledError'
  }
}

export function isCancelled(err: unknown): boolean {
  return err instanceof CancelledError || (err instanceof Error && err.message === CANCELLED_MESSAGE)
}

/** Throw immediately if the caller already cancelled. */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new CancelledError()
}

/**
 * Run provider work under a signal: aborts surface as `CancelledError` no
 * matter what shape the SDK's own abort error takes.
 */
export async function withAbort<T>(signal: AbortSignal | undefined, work: () => Promise<T>): Promise<T> {
  throwIfAborted(signal)
  try {
    return await work()
  } catch (err) {
    if (signal?.aborted) throw new CancelledError()
    throw err
  }
}
