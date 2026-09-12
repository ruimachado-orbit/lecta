import { ipcMain, app, safeStorage } from 'electron'
import { rename, readFile } from 'fs/promises'
import { join } from 'path'
import type { z } from 'zod'
import { parseSettings, SettingsSchema } from '../schemas/settings'
import { atomicWriteFile, withLock } from '../services/safe-fs'

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
  openaiAuthMode: 'apiKey',
  openaiApiKey: '',
  codexBinPath: '',
  geminiApiKey: '',
  mistralApiKey: '',
  llamaApiKey: '',
  xaiApiKey: '',
  perplexityApiKey: '',
  ollamaBaseUrl: '',
  imageProvider: 'openai',
  mcpServerEnabled: false,
  experimentalNotebook: false,
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
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      // The file exists but cannot be read or parsed. Never overwrite it
      // silently: move it aside so the user's keys can be recovered, then
      // start from defaults.
      const settingsPath = getSettingsPath()
      const backup = `${settingsPath}.corrupt-${Date.now()}`
      try {
        await rename(settingsPath, backup)
        console.error(`[settings] settings.json was unreadable (${String(err)}); moved to ${backup}`)
      } catch (renameErr) {
        console.error('[settings] settings.json unreadable and could not be moved aside:', renameErr)
      }
    }
    cachedSettings = { ...DEFAULTS }
  }
  return cachedSettings
}

/** Returns cached settings without reading from disk (for use in env-loader) */
export function getCachedSettings(): Record<string, unknown> {
  return cachedSettings
}

/**
 * The single writer for settings.json from anywhere in the main process.
 * Merges `patch` into the cached settings and persists atomically under the
 * shared 'settings' lock. Other modules must call this instead of writing
 * the file themselves.
 */
export async function updateSettings(patch: Record<string, unknown>): Promise<void> {
  await saveSettings(patch)
}

async function saveSettings(settings: Record<string, unknown>): Promise<void> {
  await withLock('settings', async () => {
    cachedSettings = { ...cachedSettings, ...settings }
    const toWrite = encryptSettings(cachedSettings)
    // Secrets live in this file — owner-only permissions, atomic replace
    await atomicWriteFile(getSettingsPath(), JSON.stringify(toWrite, null, 2), { mode: 0o600 })
  })
}

/**
 * Settings as exposed to the renderer: every secret is replaced by '' and
 * `configuredKeys[field]` says whether a value is stored for that field.
 * The renderer must never receive decrypted API keys.
 */
export function redactSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...settings }
  const configuredKeys: Record<string, boolean> = {}
  for (const field of SENSITIVE_FIELDS) {
    const val = result[field]
    configuredKeys[field] = typeof val === 'string' && val.length > 0
    result[field] = ''
  }
  result.configuredKeys = configuredKeys
  return result
}

/**
 * Normalize a settings patch coming from the renderer.
 * - For sensitive fields: '' / undefined means "unchanged" (dropped from the patch),
 *   `null` means "clear", any other string is the new value.
 * - Renderer-only fields (configuredKeys) are never persisted.
 * - Known fields that fail schema validation are dropped.
 */
function sanitizePatch(patch: unknown): Record<string, unknown> {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return {}
  const result: Record<string, unknown> = {}
  const shape = SettingsSchema.shape as Record<string, z.ZodTypeAny>
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (key === 'configuredKeys') continue
    if (SENSITIVE_FIELDS.includes(key)) {
      if (value === null) {
        result[key] = ''
      } else if (typeof value === 'string' && value.length > 0) {
        result[key] = value
      }
      // '' or undefined -> unchanged
      continue
    }
    if (key in shape) {
      const parsed = shape[key].safeParse(value)
      if (!parsed.success) continue
      result[key] = parsed.data
      continue
    }
    result[key] = value
  }
  return result
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', async () => {
    return redactSettings(await loadSettings())
  })

  ipcMain.handle('settings:set', async (_event, settings: Record<string, unknown>) => {
    const patch = sanitizePatch(settings)
    if (Object.keys(patch).length === 0) return
    await saveSettings(patch)
  })
}
