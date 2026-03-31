import { z } from 'zod'

export const SettingsSchema = z.object({
  theme: z.string().default('dark'),
  aiModel: z.string().default('claude-sonnet-4-20250514'),
  executionTimeout: z.number().default(30000),
  nativeExecutionEnabled: z.boolean().default(false),
  fontSize: z.number().default(16),
  splitRatio: z.number().default(40),
  anthropicApiKey: z.string().default(''),
  openaiApiKey: z.string().default(''),
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

/** Safely parse and validate settings JSON, falling back to defaults on invalid data */
export function parseSettings(raw: unknown): Settings {
  const result = SettingsSchema.safeParse(raw)
  if (result.success) return result.data
  // If validation fails, return defaults merged with whatever is valid
  return SettingsSchema.parse({})
}
