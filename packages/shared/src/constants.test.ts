import { describe, it, expect } from 'vitest'
import { getAllModels, getProviderForModel, getModelDef, AI_PROVIDERS, IPC } from './constants'

describe('getAllModels', () => {
  it('returns all models from all providers', () => {
    const models = getAllModels()
    expect(models.length).toBeGreaterThan(0)
    // Each model should have required fields
    for (const model of models) {
      expect(model.id).toBeTruthy()
      expect(model.name).toBeTruthy()
      expect(model.provider).toBeTruthy()
      expect(model.capabilities).toBeInstanceOf(Array)
    }
  })

  it('includes models from multiple providers', () => {
    const models = getAllModels()
    const providers = new Set(models.map(m => m.provider))
    expect(providers.size).toBeGreaterThanOrEqual(5)
  })

  it('does not include ollama models (dynamic)', () => {
    const models = getAllModels()
    const ollamaModels = models.filter(m => m.provider === 'ollama')
    expect(ollamaModels).toHaveLength(0)
  })
})

describe('getProviderForModel', () => {
  it('finds anthropic provider for claude model', () => {
    const provider = getProviderForModel('claude-sonnet-4-20250514')
    expect(provider?.id).toBe('anthropic')
  })

  it('finds openai provider for gpt model', () => {
    const provider = getProviderForModel('gpt-4o')
    expect(provider?.id).toBe('openai')
  })

  it('finds google provider for gemini model', () => {
    const provider = getProviderForModel('gemini-2.5-pro')
    expect(provider?.id).toBe('google')
  })

  it('returns undefined for unknown model', () => {
    expect(getProviderForModel('unknown-model-xyz')).toBeUndefined()
  })
})

describe('getModelDef', () => {
  it('finds model definition by ID', () => {
    const model = getModelDef('gpt-4o')
    expect(model?.name).toBe('GPT-4o')
    expect(model?.provider).toBe('openai')
  })

  it('returns undefined for unknown model', () => {
    expect(getModelDef('nonexistent')).toBeUndefined()
  })
})

describe('AI_PROVIDERS', () => {
  it('has all expected providers', () => {
    const ids = AI_PROVIDERS.map(p => p.id)
    expect(ids).toContain('anthropic')
    expect(ids).toContain('openai')
    expect(ids).toContain('google')
    expect(ids).toContain('mistral')
    expect(ids).toContain('meta')
    expect(ids).toContain('xai')
    expect(ids).toContain('perplexity')
    expect(ids).toContain('ollama')
  })

  it('each provider has required fields', () => {
    for (const provider of AI_PROVIDERS) {
      expect(provider.id).toBeTruthy()
      expect(provider.name).toBeTruthy()
      expect(provider.icon).toBeTruthy()
      expect(provider.keyEnvVar).toBeTruthy()
      expect(provider.keySettingsField).toBeTruthy()
      expect(provider.models).toBeInstanceOf(Array)
    }
  })
})

describe('IPC constants', () => {
  it('has file system channels', () => {
    expect(IPC.OPEN_FOLDER).toBe('fs:open-folder')
    expect(IPC.LOAD_PRESENTATION).toBe('fs:load-presentation')
    expect(IPC.READ_FILE).toBe('fs:read-file')
  })

  it('has execution channels', () => {
    expect(IPC.EXEC_NATIVE).toBe('exec:native')
    expect(IPC.EXEC_CANCEL).toBe('exec:cancel')
  })

  it('has AI channels', () => {
    expect(IPC.GENERATE_NOTES).toBe('ai:generate-notes')
    expect(IPC.STREAM_NOTES).toBe('ai:stream-notes')
  })
})
