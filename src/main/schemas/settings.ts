import { z } from 'zod'

export const SettingsSchema = z.object({
  theme: z.string().default('dark'),
  aiModel: z.string().default('claude-sonnet-4-20250514'),
  executionTimeout: z.number().default(30000),
  nativeExecutionEnabled: z.boolean().default(false),
  fontSize: z.number().default(16),
  splitRatio: z.number().default(40),
  anthropicApiKey: z.string().default(''),
  openaiAuthMode: z.enum(['apiKey', 'codex']).default('apiKey'),
  openaiApiKey: z.string().default(''),
  codexBinPath: z.string().default(''),
  geminiApiKey: z.string().default(''),
  mistralApiKey: z.string().default(''),
  llamaApiKey: z.string().default(''),
  xaiApiKey: z.string().default(''),
  perplexityApiKey: z.string().default(''),
  nanobananaApiKey: z.string().default(''),
  ollamaBaseUrl: z.string().default(''),
  imageProvider: z.string().default('openai'),
  mcpServerEnabled: z.boolean().default(false),
  recentDecks: z.array(z.unknown()).default([]),
}).passthrough()

export type Settings = z.infer<typeof SettingsSchema>

/**
 * Safely parse and validate settings JSON. Validation is per field: an invalid
 * value is dropped (and replaced by its default) without discarding the other
 * fields. Unknown keys are passed through unchanged.
 */
export function parseSettings(raw: unknown): Settings {
  const input: Record<string, unknown> =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {}

  const sanitized: Record<string, unknown> = { ...input }
  for (const [key, fieldSchema] of Object.entries(SettingsSchema.shape)) {
    const result = (fieldSchema as z.ZodTypeAny).safeParse(input[key])
    if (result.success) {
      sanitized[key] = result.data
    } else {
      // Drop only this invalid field; the schema default is applied below
      delete sanitized[key]
    }
  }

  const parsed = SettingsSchema.safeParse(sanitized)
  if (parsed.success) return parsed.data
  return SettingsSchema.parse({})
}
