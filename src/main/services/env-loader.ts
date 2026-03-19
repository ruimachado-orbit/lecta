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
