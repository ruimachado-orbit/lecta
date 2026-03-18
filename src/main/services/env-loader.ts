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
