import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, readFile, writeFile, readdir, stat } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * `settings.ts` is the single writer for settings.json. It only touches Electron
 * for three things — `app.getPath('userData')`, `safeStorage`, and registering the
 * two IPC handlers — so the whole module is testable with a stub `electron`.
 */
const mocks = vi.hoisted(() => ({
  userData: '',
  encryptionAvailable: true,
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string): string => {
      if (name !== 'userData') throw new Error(`unexpected app.getPath(${name})`)
      return mocks.userData
    }
  },
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown): void => {
      mocks.handlers.set(channel, fn)
    }
  },
  safeStorage: {
    isEncryptionAvailable: (): boolean => mocks.encryptionAvailable,
    encryptString: (value: string): Buffer => Buffer.from(`SEALED:${value}`, 'utf-8'),
    decryptString: (buffer: Buffer): string => {
      const text = buffer.toString('utf-8')
      if (!text.startsWith('SEALED:')) throw new Error('not sealed by this keychain')
      return text.slice('SEALED:'.length)
    }
  }
}))

import {
  loadSettings,
  updateSettings,
  getCachedSettings,
  redactSettings,
  registerSettingsHandlers
} from './settings'

registerSettingsHandlers()
const getHandler = mocks.handlers.get('settings:get')!
const setHandler = mocks.handlers.get('settings:set')!

const settingsPath = (): string => join(mocks.userData, 'settings.json')
const readRaw = async (): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(settingsPath(), 'utf-8')) as Record<string, unknown>

beforeEach(async () => {
  mocks.userData = await mkdtemp(join(tmpdir(), 'lecta-settings-'))
  mocks.encryptionAvailable = true
})

afterEach(async () => {
  await rm(mocks.userData, { recursive: true, force: true })
})

describe('registerSettingsHandlers', () => {
  it('registers exactly the two settings channels', () => {
    expect([...mocks.handlers.keys()].sort()).toEqual(['settings:get', 'settings:set'])
  })
})

describe('loadSettings', () => {
  it('returns defaults when settings.json does not exist, and writes nothing', async () => {
    const settings = await loadSettings()
    expect(settings.theme).toBe('dark')
    expect(settings.nativeExecutionEnabled).toBe(false)
    expect(settings.executionTimeout).toBe(30000)
    expect(settings.recentDecks).toEqual([])
    expect(await readdir(mocks.userData)).toEqual([])
  })

  it('merges stored values over the defaults', async () => {
    await writeFile(settingsPath(), JSON.stringify({ theme: 'light', fontSize: 22 }))
    const settings = await loadSettings()
    expect(settings.theme).toBe('light')
    expect(settings.fontSize).toBe(22)
    expect(settings.nativeExecutionEnabled).toBe(false)
  })

  it('drops a single invalid field instead of resetting the whole file', async () => {
    await writeFile(
      settingsPath(),
      JSON.stringify({ theme: 'light', executionTimeout: 'whenever', anthropicApiKey: 'sk-keep-me' })
    )
    const settings = await loadSettings()
    expect(settings.executionTimeout).toBe(30000)
    expect(settings.theme).toBe('light')
    expect(settings.anthropicApiKey).toBe('sk-keep-me')
  })

  it('moves an unparsable settings.json aside instead of overwriting it', async () => {
    await writeFile(settingsPath(), '{ this is not json')
    const settings = await loadSettings()

    expect(settings.theme).toBe('dark')
    const files = await readdir(mocks.userData)
    const corrupt = files.filter((f) => f.startsWith('settings.json.corrupt-'))
    expect(corrupt).toHaveLength(1)
    expect(await readFile(join(mocks.userData, corrupt[0]), 'utf-8')).toBe('{ this is not json')
    expect(files).not.toContain('settings.json')
  })
})

describe('secret storage', () => {
  it('encrypts sensitive fields at rest and writes the file owner-only', async () => {
    await loadSettings()
    await updateSettings({ anthropicApiKey: 'sk-ant-secret', theme: 'light' })

    const raw = await readRaw()
    expect(raw.anthropicApiKey).toBe(`enc:${Buffer.from('SEALED:sk-ant-secret', 'utf-8').toString('base64')}`)
    expect(JSON.stringify(raw)).not.toContain('sk-ant-secret')
    expect(raw.theme).toBe('light')

    if (process.platform !== 'win32') {
      expect((await stat(settingsPath())).mode & 0o777).toBe(0o600)
    }
  })

  it('decrypts them back on load', async () => {
    await loadSettings()
    await updateSettings({ openaiApiKey: 'sk-openai' })

    const reloaded = await loadSettings()
    expect(reloaded.openaiApiKey).toBe('sk-openai')
    expect(getCachedSettings().openaiApiKey).toBe('sk-openai')
  })

  it('migrates a plaintext key to encrypted on the next load', async () => {
    await writeFile(settingsPath(), JSON.stringify({ geminiApiKey: 'plaintext-key' }))

    const settings = await loadSettings()
    expect(settings.geminiApiKey).toBe('plaintext-key')

    const raw = await readRaw()
    expect(String(raw.geminiApiKey).startsWith('enc:')).toBe(true)
    expect(JSON.stringify(raw)).not.toContain('plaintext-key')
  })

  it('falls back to plaintext when the OS keychain is unavailable', async () => {
    mocks.encryptionAvailable = false
    await loadSettings()
    await updateSettings({ xaiApiKey: 'xai-key' })

    expect((await readRaw()).xaiApiKey).toBe('xai-key')
    expect((await loadSettings()).xaiApiKey).toBe('xai-key')
  })

  it('leaves an undecryptable value alone rather than losing it', async () => {
    await writeFile(settingsPath(), JSON.stringify({ mistralApiKey: 'enc:bm90LXNlYWxlZA==' }))
    const settings = await loadSettings()
    expect(settings.mistralApiKey).toBe('enc:bm90LXNlYWxlZA==')
  })
})

describe('redactSettings', () => {
  it('blanks every secret and reports which ones are configured', () => {
    const redacted = redactSettings({
      theme: 'dark',
      anthropicApiKey: 'sk-ant',
      openaiApiKey: '',
      geminiApiKey: 'g'
    })

    expect(redacted.anthropicApiKey).toBe('')
    expect(redacted.geminiApiKey).toBe('')
    expect(redacted.theme).toBe('dark')
    expect(redacted.configuredKeys).toMatchObject({
      anthropicApiKey: true,
      geminiApiKey: true,
      openaiApiKey: false,
      perplexityApiKey: false
    })
  })
})

describe('settings:get', () => {
  it('never returns a decrypted key to the renderer', async () => {
    await loadSettings()
    await updateSettings({ anthropicApiKey: 'sk-ant-secret', llamaApiKey: 'llama-secret' })

    const exposed = (await getHandler({})) as Record<string, unknown>
    expect(JSON.stringify(exposed)).not.toContain('secret')
    expect(exposed.anthropicApiKey).toBe('')
    expect(exposed.llamaApiKey).toBe('')
    expect(exposed.configuredKeys).toMatchObject({ anthropicApiKey: true, llamaApiKey: true })
  })
})

describe('settings:set', () => {
  it('stores an ordinary field and merges rather than replaces', async () => {
    await loadSettings()
    await setHandler({}, { theme: 'light' })
    await setHandler({}, { fontSize: 20 })

    const raw = await readRaw()
    expect(raw.theme).toBe('light')
    expect(raw.fontSize).toBe(20)
    expect(raw.nativeExecutionEnabled).toBe(false)
  })

  it("treats '' for a secret as 'unchanged' so a redacted round-trip cannot wipe a key", async () => {
    await loadSettings()
    await updateSettings({ anthropicApiKey: 'sk-ant-secret' })

    // Exactly what the renderer sends back after `settings:get`.
    await setHandler({}, await getHandler({}))

    expect((await loadSettings()).anthropicApiKey).toBe('sk-ant-secret')
  })

  it('clears a secret when the renderer sends null', async () => {
    await loadSettings()
    await updateSettings({ anthropicApiKey: 'sk-ant-secret' })

    await setHandler({}, { anthropicApiKey: null })

    expect((await loadSettings()).anthropicApiKey).toBe('')
    expect(JSON.stringify(await readRaw())).not.toContain('sk-ant-secret')
  })

  it('never persists the renderer-only configuredKeys field', async () => {
    await loadSettings()
    await setHandler({}, { configuredKeys: { anthropicApiKey: true }, theme: 'light' })
    expect(await readRaw()).not.toHaveProperty('configuredKeys')
  })

  it('drops a known field that fails validation and keeps the rest', async () => {
    await loadSettings()
    await setHandler({}, { executionTimeout: 'soon', nativeExecutionEnabled: true })

    const raw = await readRaw()
    expect(raw.executionTimeout).toBe(30000)
    expect(raw.nativeExecutionEnabled).toBe(true)
  })

  it('ignores a patch that is not an object, and an empty patch writes nothing', async () => {
    await loadSettings()
    await setHandler({}, 'nope')
    await setHandler({}, [1, 2, 3])
    await setHandler({}, {})
    expect(await readdir(mocks.userData)).toEqual([])
  })

  it('leaves no temp files from the atomic write', async () => {
    await loadSettings()
    await Promise.all([
      setHandler({}, { theme: 'light' }),
      setHandler({}, { fontSize: 18 }),
      setHandler({}, { splitRatio: 55 })
    ])

    expect(await readdir(mocks.userData)).toEqual(['settings.json'])
    const raw = await readRaw()
    expect(raw.theme).toBe('light')
    expect(raw.fontSize).toBe(18)
    expect(raw.splitRatio).toBe(55)
  })
})
