import { describe, it, expect } from 'vitest'
import {
  CODE_LANGUAGES,
  DEFAULT_THEME,
  EXECUTION_ENGINES,
  SLIDE_LAYOUTS,
  SLIDE_THEMES,
  SLIDE_TRANSITIONS,
  isExecutionEngine,
  isSlideLayout,
  isSlideTheme,
  isSlideTransition,
  LANGUAGE_DEFAULT_ENGINES,
  LANGUAGE_FILE_EXTENSIONS,
  LANGUAGE_NATIVE_COMMANDS,
  defaultEngineForLanguage,
  extensionForLanguage,
  isSupportedLanguage,
  nativeCommandForLanguage,
} from './slide-options'
import { detectLanguage } from './utils/path-resolver'

describe('slide option lists', () => {
  it('ships the documented themes, in order', () => {
    expect([...SLIDE_THEMES]).toEqual([
      'dark',
      'light',
      'executive',
      'minimal',
      'corporate',
      'creative',
      'keynote-dark',
      'paper',
    ])
    expect(DEFAULT_THEME).toBe('dark')
  })

  it('ships 15 code languages including markdown', () => {
    expect(CODE_LANGUAGES).toHaveLength(15)
    expect(CODE_LANGUAGES).toContain('markdown')
  })

  it('ships 12 layouts and 5 execution engines', () => {
    expect(SLIDE_LAYOUTS).toHaveLength(12)
    expect(EXECUTION_ENGINES).toHaveLength(5)
    expect(SLIDE_TRANSITIONS).toHaveLength(5)
  })

  it('has no duplicate entries in any list', () => {
    for (const list of [SLIDE_LAYOUTS, SLIDE_TRANSITIONS, SLIDE_THEMES, EXECUTION_ENGINES, CODE_LANGUAGES]) {
      expect(new Set(list).size).toBe(list.length)
    }
  })
})

describe('type guards', () => {
  it('accept known values and reject everything else', () => {
    expect(isSlideLayout('two-col')).toBe(true)
    expect(isSlideLayout('fullscreen')).toBe(false)
    expect(isSlideTransition('left')).toBe(true)
    expect(isSlideTransition('fade')).toBe(false)
    expect(isSlideTheme('keynote-dark')).toBe(true)
    expect(isSlideTheme('neon')).toBe(false)
    expect(isExecutionEngine('pyodide')).toBe(true)
    expect(isExecutionEngine('deno')).toBe(false)
    expect(isSupportedLanguage('markdown')).toBe(true)
    expect(isSupportedLanguage('cobol')).toBe(false)
    expect(isSlideLayout(undefined)).toBe(false)
    expect(isSlideTheme(42)).toBe(false)
  })
})

// These three maps moved here out of `packages/mcp-server/src/lib/presentation-io.ts`,
// which used to keep private copies (and `src/main/ipc/file-system.ts` still inlines its
// own — that one should be pointed here next).
describe('per-language defaults', () => {
  it('gives every language an engine, defaulting to native', () => {
    expect(defaultEngineForLanguage('python')).toBe('pyodide')
    expect(defaultEngineForLanguage('javascript')).toBe('sandpack')
    expect(defaultEngineForLanguage('typescript')).toBe('sandpack')
    expect(defaultEngineForLanguage('sql')).toBe('sql')
    // Anything without an in-app runtime shells out instead of silently doing nothing.
    for (const language of CODE_LANGUAGES) {
      const engine = defaultEngineForLanguage(language)
      expect(EXECUTION_ENGINES).toContain(engine)
      if (!(language in LANGUAGE_DEFAULT_ENGINES)) expect(engine).toBe('native')
    }
  })

  it('gives every language exactly one extension that detects back to it', () => {
    for (const language of CODE_LANGUAGES) {
      const ext = extensionForLanguage(language)
      expect(ext, language).toMatch(/^\.[a-z]+$/)
      expect(detectLanguage(`code/example${ext}`), language).toBe(language)
    }
    expect(Object.keys(LANGUAGE_FILE_EXTENSIONS).sort()).toEqual([...CODE_LANGUAGES].sort())
  })

  it('names a native command only where one makes sense', () => {
    expect(nativeCommandForLanguage('python')).toBe('python3')
    expect(nativeCommandForLanguage('javascript')).toBe('node')
    expect(nativeCommandForLanguage('rust')).toBe('rustc')
    // No command for languages that are not executed by a single interpreter.
    expect(nativeCommandForLanguage('json')).toBeUndefined()
    expect(nativeCommandForLanguage('markdown')).toBeUndefined()
    for (const language of Object.keys(LANGUAGE_NATIVE_COMMANDS)) {
      expect(CODE_LANGUAGES).toContain(language)
    }
  })
})
