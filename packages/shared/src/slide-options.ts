/**
 * Single source of truth for the closed sets of values a deck may use.
 *
 * These arrays back both the TypeScript unions in `types/presentation.ts` and the
 * `z.enum(...)` validators in `utils/yaml-parser.ts`, so a new layout/theme/engine
 * only ever has to be added here. The MCP server consumes these same arrays — its build
 * compiles this file into `packages/mcp-server/dist/shared` and its tool schemas are
 * `z.enum(SLIDE_LAYOUTS)` and friends — so there is no second list to keep in step.
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

// ── Per-language defaults ──
//
// A code block's engine, file extension and native command are all derived from its
// language. Keeping the three maps next to `CODE_LANGUAGES` is what makes adding a
// language a single-file change; the app (`src/main/ipc/file-system.ts`) and the MCP
// server both read them instead of carrying their own copies.

/**
 * Engine a new code block gets when the author does not pick one. Languages without an
 * in-app runtime fall through to `native`, which shells out to `nativeCommandForLanguage`.
 */
export const LANGUAGE_DEFAULT_ENGINES: Partial<Record<SupportedLanguage, ExecutionEngine>> = {
  javascript: 'sandpack',
  typescript: 'sandpack',
  python: 'pyodide',
  sql: 'sql',
}

export function defaultEngineForLanguage(language: SupportedLanguage): ExecutionEngine {
  return LANGUAGE_DEFAULT_ENGINES[language] ?? 'native'
}

/**
 * Extension a new code file gets, the inverse of `detectLanguage` in `utils/path-resolver`.
 * Every language maps to exactly one extension so a round trip through
 * `extensionForLanguage → detectLanguage` returns the language it started from.
 */
export const LANGUAGE_FILE_EXTENSIONS: Record<SupportedLanguage, string> = {
  javascript: '.js',
  typescript: '.ts',
  python: '.py',
  sql: '.sql',
  html: '.html',
  css: '.css',
  json: '.json',
  bash: '.sh',
  rust: '.rs',
  go: '.go',
  java: '.java',
  csharp: '.cs',
  ruby: '.rb',
  php: '.php',
  markdown: '.md',
}

export function extensionForLanguage(language: SupportedLanguage): string {
  return LANGUAGE_FILE_EXTENSIONS[language] ?? '.txt'
}

/**
 * Interpreter/compiler used for `execution: native`. A language that is absent has no
 * sensible single command — the caller leaves `command` unset rather than guessing.
 */
export const LANGUAGE_NATIVE_COMMANDS: Partial<Record<SupportedLanguage, string>> = {
  javascript: 'node',
  bash: 'bash',
  python: 'python3',
  rust: 'rustc',
  go: 'go',
  ruby: 'ruby',
  php: 'php',
}

export function nativeCommandForLanguage(language: SupportedLanguage): string | undefined {
  return LANGUAGE_NATIVE_COMMANDS[language]
}
