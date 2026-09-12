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
  isSupportedLanguage,
} from './slide-options'

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
