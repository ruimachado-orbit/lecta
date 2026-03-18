import { ipcMain, app } from 'electron'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const getSettingsPath = (): string =>
  join(app.getPath('userData'), 'settings.json')

let cachedSettings: Record<string, unknown> = {}

async function loadSettings(): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(getSettingsPath(), 'utf-8')
    cachedSettings = JSON.parse(content)
  } catch {
    cachedSettings = {
      theme: 'dark',
      aiModel: 'claude-sonnet-4-6-20250410',
      executionTimeout: 30000,
      nativeExecutionEnabled: false,
      fontSize: 16,
      splitRatio: 40,
      anthropicApiKey: ''
    }
  }
  return cachedSettings
}

async function saveSettings(settings: Record<string, unknown>): Promise<void> {
  cachedSettings = { ...cachedSettings, ...settings }
  const dir = app.getPath('userData')
  await mkdir(dir, { recursive: true })
  await writeFile(getSettingsPath(), JSON.stringify(cachedSettings, null, 2))
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', async () => {
    return loadSettings()
  })

  ipcMain.handle('settings:set', async (_event, settings: Record<string, unknown>) => {
    await saveSettings(settings)
  })
}
