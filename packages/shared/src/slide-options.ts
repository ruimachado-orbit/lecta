/**
 * Single source of truth for the closed sets of values a deck may use.
 *
 * These arrays back both the TypeScript unions in `types/presentation.ts` and the
 * `z.enum(...)` validators in `utils/yaml-parser.ts`, so a new layout/theme/engine
 * only ever has to be added here. The MCP server mirrors the same lists — see
 * `packages/mcp-server/src/lib/presentation-io.ts`.
 */

/** Slide layouts, in the order they are offered in the UI. */
export const SLIDE_LAYOUTS = [
  'default',             // Standard top-down flow
  'center',              // Everything centered vertically + horizontally
  'title',               // Big centered title with subtitle below
  'section',             // Section break — bold heading, accent bar
  'two-col',             // Two equal columns
  'two-col-wide-left',   // 60/40 left-heavy columns
  'two-col-wide-right',  // 40/60 right-heavy columns
  'three-col',           // Three equal columns
  'top-bottom',          // Content split top and bottom
  'big-number',          // Large stat/number with context below
  'quote',               // Blockquote-style centered quote
  'blank',               // No padding, full canvas
] as const

/** Slide-to-slide transitions. `none` is the default. */
export const SLIDE_TRANSITIONS = ['none', 'left', 'right', 'top', 'bottom'] as const

/** Built-in themes. `dark` is the default and the fallback for unknown values. */
export const SLIDE_THEMES = [
  'dark',
  'light',
  'executive',
  'minimal',
  'corporate',
  'creative',
  'keynote-dark',
  'paper',
] as const

/** The default theme applied when a deck omits `theme` or names an unknown one. */
export const DEFAULT_THEME = 'dark' satisfies (typeof SLIDE_THEMES)[number]

/** Execution engines a code block can be run with. */
export const EXECUTION_ENGINES = ['sandpack', 'pyodide', 'sql', 'native', 'none'] as const

/** Languages a code block may declare (15). */
export const CODE_LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'sql',
  'html',
  'css',
  'json',
  'bash',
  'rust',
  'go',
  'java',
  'csharp',
  'ruby',
  'php',
  'markdown',
] as const

export type SlideLayout = (typeof SLIDE_LAYOUTS)[number]
export type SlideTransition = (typeof SLIDE_TRANSITIONS)[number]
export type SlideTheme = (typeof SLIDE_THEMES)[number]
export type ExecutionEngine = (typeof EXECUTION_ENGINES)[number]
export type SupportedLanguage = (typeof CODE_LANGUAGES)[number]

export function isSlideLayout(value: unknown): value is SlideLayout {
  return typeof value === 'string' && (SLIDE_LAYOUTS as readonly string[]).includes(value)
}

export function isSlideTransition(value: unknown): value is SlideTransition {
  return typeof value === 'string' && (SLIDE_TRANSITIONS as readonly string[]).includes(value)
}

export function isSlideTheme(value: unknown): value is SlideTheme {
  return typeof value === 'string' && (SLIDE_THEMES as readonly string[]).includes(value)
}

export function isExecutionEngine(value: unknown): value is ExecutionEngine {
  return typeof value === 'string' && (EXECUTION_ENGINES as readonly string[]).includes(value)
}

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === 'string' && (CODE_LANGUAGES as readonly string[]).includes(value)
}
