import { readFile } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'

/**
 * Load the Anthropic API key using the fallback chain:
 * 1. Deck's .env file (per-presentation)
 * 2. App-level settings (~/.lecta/config.json or Electron userData)
 * 3. Process environment variable
 */
export async function loadAnthropicKey(deckRootPath?: string): Promise<string | null> {
  // 1. Check deck's .env file
  if (deckRootPath) {
    try {
      const envContent = await readFile(join(deckRootPath, '.env'), 'utf-8')
      const match = envContent.match(/ANTHROPIC_API_KEY\s*=\s*(.+)/)
      if (match && match[1]) {
        const key = match[1].trim().replace(/^["']|["']$/g, '')
        if (key && key !== 'sk-ant-your-key-here') {
          return key
        }
      }
    } catch {
      // No .env in deck root
    }
  }

  // 2. Check app-level settings
  try {
    const settingsPath = join(app.getPath('userData'), 'settings.json')
    const settingsContent = await readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(settingsContent)
    if (settings.anthropicApiKey) {
      return settings.anthropicApiKey
    }
  } catch {
    // No settings file
  }

  // 3. Check process environment
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY
  }

  return null
}

/**
 * Load the AI model using the fallback chain:
 * 1. Deck's .env file (ANTHROPIC_MODEL)
 * 2. Process environment variable (ANTHROPIC_MODEL)
 * 3. null (caller uses hardcoded default)
 */
export async function loadAnthropicModel(deckRootPath?: string): Promise<string | null> {
  if (deckRootPath) {
    try {
      const envContent = await readFile(join(deckRootPath, '.env'), 'utf-8')
      const match = envContent.match(/ANTHROPIC_MODEL\s*=\s*(.+)/)
      if (match && match[1]) {
        const model = match[1].trim().replace(/^["']|["']$/g, '')
        if (model) return model
      }
    } catch {
      // No .env in deck root
    }
  }

  if (process.env.ANTHROPIC_MODEL) {
    return process.env.ANTHROPIC_MODEL
  }

  return null
}

/**
 * Load the Gemini API key using the fallback chain:
 * 1. Deck's .env file (per-presentation)
 * 2. App-level settings
 * 3. Process environment variable
 */
export async function loadGeminiKey(deckRootPath?: string): Promise<string | null> {
  // 1. Check deck's .env file
  if (deckRootPath) {
    try {
      const envContent = await readFile(join(deckRootPath, '.env'), 'utf-8')
      const match = envContent.match(/GEMINI_API_KEY\s*=\s*(.+)/)
      if (match && match[1]) {
        const key = match[1].trim().replace(/^["']|["']$/g, '')
        if (key) return key
      }
    } catch {
      // No .env in deck root
    }
  }

  // 2. Check app-level settings
  try {
    const settingsPath = join(app.getPath('userData'), 'settings.json')
    const settingsContent = await readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(settingsContent)
    if (settings.geminiApiKey) {
      return settings.geminiApiKey
    }
  } catch {
    // No settings file
  }

  // 3. Check process environment
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY
  }

  return null
}

/**
 * Load the OpenAI API key using the fallback chain:
 * 1. Deck's .env file (per-presentation)
 * 2. App-level settings
 * 3. Process environment variable
 */
export async function loadOpenAIKey(deckRootPath?: string): Promise<string | null> {
  if (deckRootPath) {
    try {
      const envContent = await readFile(join(deckRootPath, '.env'), 'utf-8')
      const match = envContent.match(/OPENAI_API_KEY\s*=\s*(.+)/)
      if (match && match[1]) {
        const key = match[1].trim().replace(/^["']|["']$/g, '')
        if (key) return key
      }
    } catch {
      // No .env in deck root
    }
  }

  try {
    const settingsPath = join(app.getPath('userData'), 'settings.json')
    const settingsContent = await readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(settingsContent)
    if (settings.openaiApiKey) {
      return settings.openaiApiKey
    }
  } catch {
    // No settings file
  }

  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY
  }

  return null
}

/**
 * Load the Mistral API key using the fallback chain:
 * 1. Deck's .env file (per-presentation)
 * 2. App-level settings
 * 3. Process environment variable
 */
export async function loadMistralKey(deckRootPath?: string): Promise<string | null> {
  if (deckRootPath) {
    try {
      const envContent = await readFile(join(deckRootPath, '.env'), 'utf-8')
      const match = envContent.match(/MISTRAL_API_KEY\s*=\s*(.+)/)
      if (match && match[1]) {
        const key = match[1].trim().replace(/^["']|["']$/g, '')
        if (key) return key
      }
    } catch {
      // No .env in deck root
    }
  }

  try {
    const settingsPath = join(app.getPath('userData'), 'settings.json')
    const settingsContent = await readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(settingsContent)
    if (settings.mistralApiKey) {
      return settings.mistralApiKey
    }
  } catch {
    // No settings file
  }

  if (process.env.MISTRAL_API_KEY) {
    return process.env.MISTRAL_API_KEY
  }

  return null
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
    try {
      const envContent = await readFile(join(deckRootPath, '.env'), 'utf-8')
      // Prefer AI_MODEL, fall back to ANTHROPIC_MODEL
      const match = envContent.match(/AI_MODEL\s*=\s*(.+)/) || envContent.match(/ANTHROPIC_MODEL\s*=\s*(.+)/)
      if (match && match[1]) {
        const model = match[1].trim().replace(/^["']|["']$/g, '')
        if (model) return model
      }
    } catch {
      // No .env in deck root
    }
  }

  try {
    const settingsPath = join(app.getPath('userData'), 'settings.json')
    const settingsContent = await readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(settingsContent)
    if (settings.aiModel) {
      return settings.aiModel
    }
  } catch {}

  if (process.env.AI_MODEL || process.env.ANTHROPIC_MODEL) {
    return process.env.AI_MODEL || process.env.ANTHROPIC_MODEL || null
  }

  return null
}

/**
 * Generic key loader for any provider using env var name + settings field name.
 */
async function loadGenericKey(
  envVar: string,
  settingsField: string,
  deckRootPath?: string
): Promise<string | null> {
  if (deckRootPath) {
    try {
      const envContent = await readFile(join(deckRootPath, '.env'), 'utf-8')
      const regex = new RegExp(`${envVar}\\s*=\\s*(.+)`)
      const match = envContent.match(regex)
      if (match && match[1]) {
        const key = match[1].trim().replace(/^["']|["']$/g, '')
        if (key) return key
      }
    } catch {}
  }

  try {
    const settingsPath = join(app.getPath('userData'), 'settings.json')
    const settingsContent = await readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(settingsContent)
    if (settings[settingsField]) return settings[settingsField]
  } catch {}

  if (process.env[envVar]) return process.env[envVar]!

  return null
}

/** Provider ID → { envVar, settingsField } */
const PROVIDER_KEY_MAP: Record<string, { envVar: string; settingsField: string }> = {
  anthropic:   { envVar: 'ANTHROPIC_API_KEY',   settingsField: 'anthropicApiKey' },
  openai:      { envVar: 'OPENAI_API_KEY',      settingsField: 'openaiApiKey' },
  google:      { envVar: 'GEMINI_API_KEY',       settingsField: 'geminiApiKey' },
  mistral:     { envVar: 'MISTRAL_API_KEY',      settingsField: 'mistralApiKey' },
  meta:        { envVar: 'LLAMA_API_KEY',        settingsField: 'llamaApiKey' },
  xai:         { envVar: 'XAI_API_KEY',          settingsField: 'xaiApiKey' },
  perplexity:  { envVar: 'PERPLEXITY_API_KEY',   settingsField: 'perplexityApiKey' },
  ollama:      { envVar: 'OLLAMA_BASE_URL',      settingsField: 'ollamaBaseUrl' },
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
  if (mapping) return loadGenericKey(mapping.envVar, mapping.settingsField, deckRootPath)
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
    try {
      const envContent = await readFile(join(deckRootPath, '.env'), 'utf-8')
      const regex = new RegExp(`${mapping.envVar}\\s*=\\s*(.+)`)
      const match = envContent.match(regex)
      if (match && match[1]?.trim().replace(/^["']|["']$/g, '')) return 'env-file'
    } catch {}
  }

  // 2. Check app settings
  try {
    const settingsPath = join(app.getPath('userData'), 'settings.json')
    const settingsContent = await readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(settingsContent)
    if (settings[mapping.settingsField]) return 'settings'
  } catch {}

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
    try {
      const envContent = await readFile(join(deckRootPath, '.env'), 'utf-8')
      const match = envContent.match(/IMAGE_PROVIDER\s*=\s*(.+)/)
      if (match && match[1]) {
        return match[1].trim().replace(/^["']|["']$/g, '')
      }
    } catch {}
  }

  try {
    const settingsPath = join(app.getPath('userData'), 'settings.json')
    const settingsContent = await readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(settingsContent)
    if (settings.imageProvider) {
      return settings.imageProvider
    }
  } catch {}

  return 'openai'
}
