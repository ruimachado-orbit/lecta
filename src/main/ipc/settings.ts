import { ipcMain, app, safeStorage } from 'electron'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { parseSettings } from '../schemas/settings'

const getSettingsPath = (): string =>
  join(app.getPath('userData'), 'settings.json')

let cachedSettings: Record<string, unknown> = {}

const DEFAULTS: Record<string, unknown> = {
  theme: 'dark',
  aiModel: 'claude-sonnet-4-20250514',
  executionTimeout: 30000,
  nativeExecutionEnabled: false,
  fontSize: 16,
  splitRatio: 40,
  anthropicApiKey: '',
  openaiApiKey: '',
  geminiApiKey: '',
  mistralApiKey: '',
  llamaApiKey: '',
  xaiApiKey: '',
  perplexityApiKey: '',
  ollamaBaseUrl: '',
  imageProvider: 'openai',
  mcpServerEnabled: false,
  recentDecks: []
}

/** Fields that contain secrets and should be encrypted at rest */
const SENSITIVE_FIELDS = [
  'anthropicApiKey',
  'openaiApiKey',
  'geminiApiKey',
  'mistralApiKey',
  'llamaApiKey',
  'xaiApiKey',
  'perplexityApiKey',
  'nanobananaApiKey',
]

const ENC_PREFIX = 'enc:'

function canEncrypt(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function encryptValue(value: string): string {
  if (!value || !canEncrypt()) return value
  const encrypted = safeStorage.encryptString(value)
  return ENC_PREFIX + encrypted.toString('base64')
}

function decryptValue(value: string): string {
  if (!value || !value.startsWith(ENC_PREFIX)) return value
  if (!canEncrypt()) return value
  try {
    const buffer = Buffer.from(value.slice(ENC_PREFIX.length), 'base64')
    return safeStorage.decryptString(buffer)
  } catch {
    return value
  }
}

function decryptSettings(raw: Record<string, unknown>): Record<string, unknown> {
  const result = { ...raw }
  for (const field of SENSITIVE_FIELDS) {
    if (typeof result[field] === 'string') {
      result[field] = decryptValue(result[field] as string)
    }
  }
  return result
}

function encryptSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const result = { ...settings }
  for (const field of SENSITIVE_FIELDS) {
    const val = result[field]
    if (typeof val === 'string' && val && !val.startsWith(ENC_PREFIX)) {
      result[field] = encryptValue(val)
    }
  }
  return result
}

export async function loadSettings(): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(getSettingsPath(), 'utf-8')
    const raw = parseSettings({ ...DEFAULTS, ...JSON.parse(content) })
    cachedSettings = decryptSettings(raw)

    // Auto-migrate: if any sensitive fields were plaintext on disk, re-save encrypted
    if (canEncrypt()) {
      const needsMigration = SENSITIVE_FIELDS.some((f) => {
        const val = raw[f]
        return typeof val === 'string' && val && !val.startsWith(ENC_PREFIX)
      })
      if (needsMigration) {
        await saveSettings(cachedSettings)
      }
    }
  } catch {
    cachedSettings = { ...DEFAULTS }
  }
  return cachedSettings
}

/** Returns cached settings without reading from disk (for use in env-loader) */
export function getCachedSettings(): Record<string, unknown> {
  return cachedSettings
}

async function saveSettings(settings: Record<string, unknown>): Promise<void> {
  cachedSettings = { ...cachedSettings, ...settings }
  const dir = app.getPath('userData')
  await mkdir(dir, { recursive: true })
  const toWrite = encryptSettings(cachedSettings)
  await writeFile(getSettingsPath(), JSON.stringify(toWrite, null, 2))
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', async () => {
    return loadSettings()
  })

  ipcMain.handle('settings:set', async (_event, settings: Record<string, unknown>) => {
    await saveSettings(settings)
  })
}
