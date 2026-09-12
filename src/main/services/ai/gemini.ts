import type { GoogleGenAI, Content, Part, FunctionDeclaration } from '@google/genai'
import {
  CancelledError,
  throwIfAborted,
  withAbort,
  type GenerateRequest,
  type LLMAdapter,
  type ToolCall,
  type ToolChatRequest,
  type ToolChatResult,
  type ToolChatState,
  type ToolSchema,
} from './types'

interface GeminiToolChatState extends ToolChatState {
  readonly provider: 'google'
  contents: Content[]
}

/**
 * Gemini rejects a `parameters` schema whose `properties` map is empty, so a
 * parameterless tool must be declared with no `parameters` key at all.
 */
export function toFunctionDeclarations(tools: ToolSchema[]): FunctionDeclaration[] {
  return tools.map((t) => {
    const schema = t.parameters as { properties?: Record<string, unknown> }
    const hasProperties = !!schema.properties && Object.keys(schema.properties).length > 0
    return {
      name: t.name,
      description: t.description,
      ...(hasProperties ? { parameters: t.parameters as FunctionDeclaration['parameters'] } : {}),
    }
  })
}

function toContents(messages: { role: 'user' | 'assistant'; content: string }[]): Content[] {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))
}

/** Google Gemini adapter (@google/genai), using function declarations for tools. */
export function createGeminiAdapter(getClient: () => Promise<GoogleGenAI>): LLMAdapter {
  return {
    id: 'google',

    async generate(req: GenerateRequest): Promise<string> {
      const client = await getClient()
      return withAbort(req.signal, async () => {
        const response = await client.models.generateContent({
          model: req.model,
          contents: toContents(req.messages),
          config: {
            systemInstruction: req.system,
            maxOutputTokens: req.maxTokens,
            ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
            ...(req.signal ? { abortSignal: req.signal } : {}),
          },
        })
        return response.text ?? ''
      })
    },

    async stream(req: GenerateRequest, onChunk: (t: string) => void): Promise<string> {
      const client = await getClient()
      return withAbort(req.signal, async () => {
        const response = await client.models.generateContentStream({
          model: req.model,
          contents: toContents(req.messages),
          config: {
            systemInstruction: req.system,
            maxOutputTokens: req.maxTokens,
            ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
            ...(req.signal ? { abortSignal: req.signal } : {}),
          },
        })
        let full = ''
        for await (const chunk of response) {
          if (req.signal?.aborted) throw new CancelledError()
          const text = chunk.text
          if (text) {
            full += text
            onChunk(text)
          }
        }
        return full
      })
    },

    async chatWithTools(req: ToolChatRequest): Promise<ToolChatResult> {
      throwIfAborted(req.signal)
      const client = await getClient()

      const prior = req.state as GeminiToolChatState | undefined
      const contents: Content[] = prior ? [...prior.contents] : toContents(req.messages)

      // Every functionCall must be answered by a functionResponse with the same name.
      if (req.toolResults?.length) {
        contents.push({
          role: 'user',
          parts: req.toolResults.map((r) => ({
            functionResponse: { name: r.name, response: { result: r.result, isError: r.isError } },
          })),
        })
      }

      const response = await withAbort(req.signal, () =>
        client.models.generateContent({
          model: req.model,
          contents,
          config: {
            systemInstruction: req.system,
            maxOutputTokens: req.maxTokens,
            ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
            ...(req.signal ? { abortSignal: req.signal } : {}),
            tools: [{ functionDeclarations: toFunctionDeclarations(req.tools) }],
          },
        })
      )

      const parts: Part[] = response.candidates?.[0]?.content?.parts ?? []
      // A new array: the one just sent to the SDK must not be mutated behind it.
      const nextContents: Content[] = parts.length > 0
        ? [...contents, { role: 'model', parts }]
        : [...contents]

      const text = parts.map((p) => p.text ?? '').join('')

      const toolCalls: ToolCall[] = []
      for (const part of parts) {
        const fc = part.functionCall
        if (!fc?.name) continue
        toolCalls.push({
          id: fc.id || `tc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: fc.name,
          input: (fc.args ?? {}) as Record<string, unknown>,
        })
      }

      const state: GeminiToolChatState = { provider: 'google', contents: nextContents }
      return { text, toolCalls, state }
    },
  }
}
