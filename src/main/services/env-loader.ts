import { readFile } from 'fs/promises'
import { join } from 'path'
import { loadSettings, getCachedSettings } from '../ipc/settings'

/** Read a setting from cached settings (already decrypted). Falls back to loadSettings() if cache is empty. */
async function getSettingsValue(field: string): Promise<string | null> {
  let settings = getCachedSettings()
  if (!settings || Object.keys(settings).length === 0) {
    settings = await loadSettings()
  }
  const val = settings[field]
  return typeof val === 'string' && val ? val : null
}

/** Parse a key=value from a .env file */
function parseEnvValue(content: string, envVar: string): string | null {
  const regex = new RegExp(`${envVar}\\s*=\\s*(.+)`)
  const match = content.match(regex)
  if (match && match[1]) {
    const val = match[1].trim().replace(/^["']|["']$/g, '')
    if (val) return val
  }
  return null
}

/** Read the deck's .env file content (cached per call chain) */
async function readDeckEnv(deckRootPath: string): Promise<string | null> {
  try {
    return await readFile(join(deckRootPath, '.env'), 'utf-8')
  } catch {
    return null
  }
}

/**
 * Generic key loader: deck .env → app settings → process env.
 */
async function loadKey(
  envVar: string,
  settingsField: string,
  deckRootPath?: string,
  placeholder?: string
): Promise<string | null> {
  // 1. Check deck's .env file
  if (deckRootPath) {
    const envContent = await readDeckEnv(deckRootPath)
    if (envContent) {
      const key = parseEnvValue(envContent, envVar)
      if (key && key !== placeholder) return key
    }
  }

  // 2. Check app-level settings (decrypted)
  const settingsVal = await getSettingsValue(settingsField)
  if (settingsVal) return settingsVal

  // 3. Check process environment
  if (process.env[envVar]) return process.env[envVar]!

  return null
}

/**
 * Load the Anthropic API key using the fallback chain:
 * 1. Deck's .env file (per-presentation)
 * 2. App-level settings (~/.lecta/config.json or Electron userData)
 * 3. Process environment variable
 */
export async function loadAnthropicKey(deckRootPath?: string): Promise<string | null> {
  return loadKey('ANTHROPIC_API_KEY', 'anthropicApiKey', deckRootPath, 'sk-ant-your-key-here')
}

/**
 * Load the AI model from the deck's .env or process env.
 * Returns null if not set (caller uses hardcoded default).
 */
export async function loadAnthropicModel(deckRootPath?: string): Promise<string | null> {
  if (deckRootPath) {
    const envContent = await readDeckEnv(deckRootPath)
    if (envContent) {
      const model = parseEnvValue(envContent, 'ANTHROPIC_MODEL')
      if (model) return model
    }
  }

  if (process.env.ANTHROPIC_MODEL) {
    return process.env.ANTHROPIC_MODEL
  }

  return null
}

/**
 * Load the Gemini API key using the fallback chain.
 */
export async function loadGeminiKey(deckRootPath?: string): Promise<string | null> {
  return loadKey('GEMINI_API_KEY', 'geminiApiKey', deckRootPath)
}

/**
 * Load the OpenAI API key using the fallback chain.
 */
export async function loadOpenAIKey(deckRootPath?: string): Promise<string | null> {
  return loadKey('OPENAI_API_KEY', 'openaiApiKey', deckRootPath)
}

/**
 * Load the Mistral API key using the fallback chain.
 */
export async function loadMistralKey(deckRootPath?: string): Promise<string | null> {
  return loadKey('MISTRAL_API_KEY', 'mistralApiKey', deckRootPath)
}

/**
 * Load the AI model from the fallback chain:
 * 1. Deck's .env file (AI_MODEL or ANTHROPIC_MODEL)
 * 2. App-level settings (aiModel)
 * 3. Process environment variable
 * 4. null (caller uses hardcoded default)
 */
export async function loadAIModel(deckRootPath?: string): Promise<string | null> {
  if (deckRootPath) {
    const envContent = await readDeckEnv(deckRootPath)
    if (envContent) {
      // Prefer AI_MODEL, fall back to ANTHROPIC_MODEL
      const model = parseEnvValue(envContent, 'AI_MODEL') || parseEnvValue(envContent, 'ANTHROPIC_MODEL')
      if (model) return model
    }
  }

  const settingsVal = await getSettingsValue('aiModel')
  if (settingsVal) return settingsVal

  if (process.env.AI_MODEL || process.env.ANTHROPIC_MODEL) {
    return process.env.AI_MODEL || process.env.ANTHROPIC_MODEL || null
  }

  return null
}

/** Provider ID → { envVar, settingsField } */
const PROVIDER_KEY_MAP: Record<string, { envVar: string; settingsField: string }> = {
  anthropic:    { envVar: 'ANTHROPIC_API_KEY',    settingsField: 'anthropicApiKey' },
  openai:       { envVar: 'OPENAI_API_KEY',       settingsField: 'openaiApiKey' },
  google:       { envVar: 'GEMINI_API_KEY',        settingsField: 'geminiApiKey' },
  mistral:      { envVar: 'MISTRAL_API_KEY',       settingsField: 'mistralApiKey' },
  meta:         { envVar: 'LLAMA_API_KEY',         settingsField: 'llamaApiKey' },
  xai:          { envVar: 'XAI_API_KEY',           settingsField: 'xaiApiKey' },
  perplexity:   { envVar: 'PERPLEXITY_API_KEY',    settingsField: 'perplexityApiKey' },
  ollama:       { envVar: 'OLLAMA_BASE_URL',       settingsField: 'ollamaBaseUrl' },
  nanobanana:   { envVar: 'NANOBANANA_API_KEY',    settingsField: 'nanobananaApiKey' },
}

/**
 * Public generic key loader — used by services that need keys for newer providers.
 */
export async function loadGenericProviderKey(
  envVar: string,
  settingsField: string,
  deckRootPath?: string
): Promise<string | null> {
  return loadKey(envVar, settingsField, deckRootPath)
}

/**
 * Load an API key for a given provider by ID.
 */
export async function loadProviderKey(
  providerId: string,
  deckRootPath?: string
): Promise<string | null> {
  // Use dedicated loaders for the original four (they handle legacy patterns)
  switch (providerId) {
    case 'anthropic': return loadAnthropicKey(deckRootPath)
    case 'openai': return loadOpenAIKey(deckRootPath)
    case 'google': return loadGeminiKey(deckRootPath)
    case 'mistral': return loadMistralKey(deckRootPath)
  }
  // Generic loader for newer providers
  const mapping = PROVIDER_KEY_MAP[providerId]
  if (mapping) return loadKey(mapping.envVar, mapping.settingsField, deckRootPath)
  return null
}

export type KeySource = 'env-file' | 'settings' | 'env-var' | null

/**
 * Determine where a provider's key is coming from.
 */
export async function getProviderKeySource(
  providerId: string,
  deckRootPath?: string
): Promise<KeySource> {
  const mapping = PROVIDER_KEY_MAP[providerId]
  if (!mapping) return null

  // 1. Check deck's .env file
  if (deckRootPath) {
    const envContent = await readDeckEnv(deckRootPath)
    if (envContent) {
      const val = parseEnvValue(envContent, mapping.envVar)
      if (val) return 'env-file'
    }
  }

  // 2. Check app settings
  const settingsVal = await getSettingsValue(mapping.settingsField)
  if (settingsVal) return 'settings'

  // 3. Check process env
  if (process.env[mapping.envVar]) return 'env-var'

  return null
}

/**
 * Load the selected image generation provider from settings.
 * Returns 'gemini' | 'openai', defaults to 'openai'.
 */
export async function loadImageProvider(deckRootPath?: string): Promise<string> {
  if (deckRootPath) {
    const envContent = await readDeckEnv(deckRootPath)
    if (envContent) {
      const val = parseEnvValue(envContent, 'IMAGE_PROVIDER')
      if (val) return val
    }
  }

  const settingsVal = await getSettingsValue('imageProvider')
  if (settingsVal) return settingsVal

  return 'openai'
}
