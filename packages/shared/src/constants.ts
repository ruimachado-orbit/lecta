// IPC Channel names
export const IPC = {
  // File system
  OPEN_FOLDER: 'fs:open-folder',
  LOAD_PRESENTATION: 'fs:load-presentation',
  READ_FILE: 'fs:read-file',
  GET_RECENT_DECKS: 'fs:get-recent-decks',
  FILE_CHANGED: 'fs:file-changed',

  // Execution
  EXEC_NATIVE: 'exec:native',
  EXEC_CANCEL: 'exec:cancel',
  EXEC_OUTPUT: 'exec:output',
  EXEC_ERROR: 'exec:error',
  EXEC_DONE: 'exec:done',

  // AI
  GENERATE_NOTES: 'ai:generate-notes',
  STREAM_NOTES: 'ai:stream-notes',

  // Artifacts
  OPEN_SYSTEM: 'artifacts:open-system',
  READ_BUFFER: 'artifacts:read-buffer',

  // Presenter
  OPEN_PRESENTER: 'presenter:open',
  SYNC_SLIDE: 'presenter:sync-slide',

  // Settings
  GET_SETTINGS: 'settings:get',
  SET_SETTINGS: 'settings:set'
} as const

export const EXECUTION_TIMEOUT_MS = 30_000

export const SUPPORTED_ARTIFACT_TYPES = {
  pdf: ['.pdf'],
  excel: ['.xlsx', '.xls', '.csv'],
  image: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'],
  document: ['.doc', '.docx', '.txt', '.md']
} as const

export const DEFAULT_AI_MODEL = 'claude-sonnet-4-20250514'

export const APP_CONFIG_DIR = '.lecta'
export const DECK_CONFIG_FILE = 'lecta.yaml'

// ── Multi-provider AI definitions ──

export type AIProviderID = 'anthropic' | 'openai' | 'google' | 'mistral' | 'meta' | 'xai' | 'perplexity' | 'ollama'

export interface AIProviderDef {
  id: AIProviderID
  name: string
  icon: string // emoji/short label for UI
  keyEnvVar: string
  keySettingsField: string
  models: AIModelDef[]
}

export interface AIModelDef {
  id: string
  name: string
  provider: AIProviderID
  capabilities: ('text' | 'image' | 'code')[]
}

export const AI_PROVIDERS: AIProviderDef[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    icon: 'A',
    keyEnvVar: 'ANTHROPIC_API_KEY',
    keySettingsField: 'anthropicApiKey',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', capabilities: ['text', 'code'] },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic', capabilities: ['text', 'code'] },
      { id: 'claude-haiku-4-20250414', name: 'Claude Haiku 4', provider: 'anthropic', capabilities: ['text', 'code'] },
    ]
  },
  {
    id: 'openai',
    name: 'OpenAI',
    icon: 'O',
    keyEnvVar: 'OPENAI_API_KEY',
    keySettingsField: 'openaiApiKey',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', capabilities: ['text', 'code'] },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', capabilities: ['text', 'code'] },
      { id: 'o3', name: 'o3', provider: 'openai', capabilities: ['text', 'code'] },
      { id: 'o3-mini', name: 'o3 Mini', provider: 'openai', capabilities: ['text', 'code'] },
      { id: 'o4-mini', name: 'o4 Mini', provider: 'openai', capabilities: ['text', 'code'] },
    ]
  },
  {
    id: 'google',
    name: 'Google Gemini',
    icon: 'G',
    keyEnvVar: 'GEMINI_API_KEY',
    keySettingsField: 'geminiApiKey',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google', capabilities: ['text', 'code'] },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google', capabilities: ['text', 'code'] },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', capabilities: ['text', 'code'] },
    ]
  },
  {
    id: 'mistral',
    name: 'Mistral',
    icon: 'M',
    keyEnvVar: 'MISTRAL_API_KEY',
    keySettingsField: 'mistralApiKey',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', provider: 'mistral', capabilities: ['text', 'code'] },
      { id: 'mistral-medium-latest', name: 'Mistral Medium', provider: 'mistral', capabilities: ['text', 'code'] },
      { id: 'mistral-small-latest', name: 'Mistral Small', provider: 'mistral', capabilities: ['text', 'code'] },
    ]
  },
  {
    id: 'meta',
    name: 'Meta Llama',
    icon: 'L',
    keyEnvVar: 'LLAMA_API_KEY',
    keySettingsField: 'llamaApiKey',
    models: [
      { id: 'Llama-4-Maverick-17B-128E-Instruct-FP8', name: 'Llama 4 Maverick', provider: 'meta', capabilities: ['text', 'code'] },
      { id: 'Llama-4-Scout-17B-16E-Instruct', name: 'Llama 4 Scout', provider: 'meta', capabilities: ['text', 'code'] },
      { id: 'Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', provider: 'meta', capabilities: ['text', 'code'] },
    ]
  },
  {
    id: 'xai',
    name: 'xAI',
    icon: 'X',
    keyEnvVar: 'XAI_API_KEY',
    keySettingsField: 'xaiApiKey',
    models: [
      { id: 'grok-3', name: 'Grok 3', provider: 'xai', capabilities: ['text', 'code'] },
      { id: 'grok-3-fast', name: 'Grok 3 Fast', provider: 'xai', capabilities: ['text', 'code'] },
      { id: 'grok-3-mini', name: 'Grok 3 Mini', provider: 'xai', capabilities: ['text', 'code'] },
      { id: 'grok-3-mini-fast', name: 'Grok 3 Mini Fast', provider: 'xai', capabilities: ['text', 'code'] },
    ]
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    icon: 'P',
    keyEnvVar: 'PERPLEXITY_API_KEY',
    keySettingsField: 'perplexityApiKey',
    models: [
      { id: 'sonar-pro', name: 'Sonar Pro', provider: 'perplexity', capabilities: ['text', 'code'] },
      { id: 'sonar', name: 'Sonar', provider: 'perplexity', capabilities: ['text', 'code'] },
      { id: 'sonar-reasoning-pro', name: 'Sonar Reasoning Pro', provider: 'perplexity', capabilities: ['text', 'code'] },
      { id: 'sonar-reasoning', name: 'Sonar Reasoning', provider: 'perplexity', capabilities: ['text', 'code'] },
    ]
  },
  {
    id: 'ollama',
    name: 'Ollama',
    icon: '🦙',
    keyEnvVar: 'OLLAMA_BASE_URL',
    keySettingsField: 'ollamaBaseUrl',
    models: [] // Models are fetched dynamically from the running Ollama instance
  },
]

/** Get all models across all providers */
export function getAllModels(): AIModelDef[] {
  return AI_PROVIDERS.flatMap((p) => p.models)
}

/** Find provider by model ID */
export function getProviderForModel(modelId: string): AIProviderDef | undefined {
  return AI_PROVIDERS.find((p) => p.models.some((m) => m.id === modelId))
}

/** Find model definition by ID */
export function getModelDef(modelId: string): AIModelDef | undefined {
  return getAllModels().find((m) => m.id === modelId)
}
