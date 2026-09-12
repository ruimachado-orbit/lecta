/**
 * Single-file deck authoring — the Slidev-style on-ramp.
 *
 * A whole deck can be written as ONE markdown file:
 *
 * ```md
 * ---
 * title: My Talk
 * author: Me
 * theme: executive
 * ---
 * # Slide one
 * Body…
 * ---
 * layout: two-col
 * ---
 * # Slide two
 * ```python file=demo.py execution=pyodide packages=[numpy]
 * print("hi")
 * ```
 * <!-- notes -->
 * Speaker notes here
 * ```
 *
 * The folder format (`lecta.yaml` + `slides/*.md` + `code/*`) stays canonical: opening a
 * single file *materializes* it into a folder, and `folderToSingleFile` exports a folder
 * deck back to one file. Everything here is pure — no filesystem access — so both
 * directions are unit-testable and the main process owns every write.
 *
 * Rules, in one place:
 * - A line that is EXACTLY `---` (at column 0, trailing spaces allowed) separates blocks.
 *   `----` and longer runs are ordinary markdown thematic breaks and never split a slide.
 * - `---` inside a fenced code block never splits.
 * - The first block is deck frontmatter when the file's very first line is `---`.
 * - A block whose keys are ALL known slide options is a per-slide options block and
 *   applies to the block after it.
 * - A fenced code block whose info string carries `file=` becomes the slide's code file
 *   and is lifted out of the slide markdown.
 * - A line `<!-- notes -->` ends the slide body; everything after it is speaker notes.
 *
 * Known limitations (documented, not bugs):
 * - A setext heading underlined with `---` is read as a slide separator. Use `#` headings.
 * - MDX slides are not expressible in a single file; materialized slides are always `.md`.
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type {
  AIConfig,
  CodeBlockConfig,
  Presentation,
  SlideBackground,
  SlideConfig,
  SlideGroupConfig,
} from '../types/presentation.js'
import type {
  ExecutionEngine,
  SlideLayout,
  SlideTransition,
  SupportedLanguage,
} from '../slide-options.js'
import {
  DEFAULT_THEME,
  defaultEngineForLanguage,
  isExecutionEngine,
  isSlideLayout,
  isSlideTheme,
  isSlideTransition,
  isSupportedLanguage,
  nativeCommandForLanguage,
} from '../slide-options.js'
import { detectLanguage } from './path-resolver.js'
import { parsePresentationYaml, serializePresentation } from './yaml-parser.js'

// ── Language defaults ──────────────────────────────────────────────────────────
//
// Engine and native command come from `slide-options.ts`, the single source the app
// (`fs:add-code-to-slide`) and the MCP server also read — a `file=` fence therefore
// gets exactly the same defaults as a code block added from the UI.

/** Fence tags people actually type, mapped onto the 15 languages a deck may declare. */
const LANGUAGE_ALIASES: Record<string, SupportedLanguage> = {
  js: 'javascript',
  jsx: 'javascript',
  node: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  python3: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  sqlite: 'sql',
  postgres: 'sql',
  rs: 'rust',
  golang: 'go',
  'c#': 'csharp',
  cs: 'csharp',
  rb: 'ruby',
  md: 'markdown',
  htm: 'html',
}

function resolveLanguage(tag: string): SupportedLanguage | null {
  const key = tag.trim().toLowerCase()
  if (!key) return null
  if (isSupportedLanguage(key)) return key
  return LANGUAGE_ALIASES[key] ?? null
}

// ── Slugs (same rules as packages/mcp-server/src/lib/presentation-io.ts) ────────

/**
 * Kebab-case slug. Unicode-aware: any letter or number in any script is kept, so a
 * non-Latin heading does not slug to the empty string.
 */
export function toSlug(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

/** Longest slug we will put in an id or a file name. */
const MAX_SLUG_LENGTH = 60

/**
 * A slug that is always usable as an id and as a file name. Falls back to a stable
 * code-point-derived name when the text has nothing slug-able in it (emoji, punctuation).
 */
export function toSafeSlug(text: string, fallback = 'untitled'): string {
  const slug = toSlug(text).slice(0, MAX_SLUG_LENGTH).replace(/-+$/, '')
  if (slug) return slug
  const codes = Array.from(text.trim())
    .map((c) => c.codePointAt(0)!.toString(16))
    .join('')
    .slice(0, 12)
  return codes ? `${fallback}-${codes}` : fallback
}

/** Append `-2`, `-3`, … until `base` is not already in `taken`; records the winner. */
function unique(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    taken.add(base)
    return base
  }
  let n = 2
  while (taken.has(`${base}-${n}`)) n += 1
  const result = `${base}-${n}`
  taken.add(result)
  return result
}

/** Append `-2`, `-3`, … before the extension until the path is free. */
function uniquePath(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    taken.add(base)
    return base
  }
  const dot = base.lastIndexOf('.')
  const slash = base.lastIndexOf('/')
  const hasExt = dot > slash + 1
  const stem = hasExt ? base.slice(0, dot) : base
  const ext = hasExt ? base.slice(dot) : ''
  let n = 2
  while (taken.has(`${stem}-${n}${ext}`)) n += 1
  const result = `${stem}-${n}${ext}`
  taken.add(result)
  return result
}

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Deck-level config without the runtime-only `rootPath` and without `slides`
 * (slides are returned alongside it). Any `Presentation` is assignable to this.
 */
export interface PresentationInput {
  title: string
  author: string
  theme: string
  lastViewedIndex?: number
  ai?: AIConfig
  groups?: SlideGroupConfig[]
  presenterNotes?: string
}

/** A slide's code block plus the source text that was inside the fence. */
export interface SingleFileCode extends CodeBlockConfig {
  /** The fence body — what gets written to `code.file`. */
  source: string
}

export interface ParsedSingleFileSlide {
  id: string
  markdown: string
  code?: SingleFileCode
  notes?: string
  title?: string
  layout?: SlideLayout
  transition?: SlideTransition
  skipped?: boolean
  background?: SlideBackground
}

export interface ParsedSingleFileDeck {
  config: PresentationInput
  slides: ParsedSingleFileSlide[]
  /** Non-fatal problems (unknown layout, unusable `file=`, …) worth logging. */
  warnings: string[]
}

/** One file `materializeToFolder` wants written, relative to the deck root. */
export interface MaterializedFile {
  relativePath: string
  content: string
  /**
   * `code` files carry the author's source and must be created with
   * `writeFileIfMissing` — never truncate code that is already on disk.
   */
  kind: 'manifest' | 'slide' | 'code' | 'notes'
}

export interface MaterializedDeck {
  /** Schema-validated manifest, exactly as `lecta.yaml` will parse back. */
  manifest: Presentation
  /** Everything to write, `lecta.yaml` first. */
  files: MaterializedFile[]
}

/** What `folderToSingleFile` needs per slide — `LoadedSlide` satisfies it as-is. */
export interface SingleFileSlideSource {
  config: SlideConfig
  markdownContent: string
  codeContent?: string | null
  notesContent?: string | null
}

// ── Block splitting ────────────────────────────────────────────────────────────

/** EXACTLY three dashes on their own line. `----` is a thematic break, not a separator. */
const SEPARATOR_RE = /^-{3}[ \t]*$/

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/

function normalizeText(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
}

/**
 * Split on separator lines, ignoring separators inside fenced code blocks.
 * Returns the text between separators; N separators yield N+1 blocks.
 */
function splitBlocks(text: string): string[] {
  const blocks: string[] = []
  let current: string[] = []
  let fence: { char: string; len: number } | null = null

  for (const line of text.split('\n')) {
    const fenceMatch = FENCE_RE.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[1]
      if (!fence) {
        fence = { char: marker[0], len: marker.length }
      } else if (
        marker[0] === fence.char &&
        marker.length >= fence.len &&
        fenceMatch[2].trim() === ''
      ) {
        fence = null
      }
    }
    if (!fence && SEPARATOR_RE.test(line)) {
      blocks.push(current.join('\n'))
      current = []
      continue
    }
    current.push(line)
  }
  blocks.push(current.join('\n'))
  return blocks
}

/** Drop leading/trailing blank lines without touching interior spacing. */
function trimBlankLines(text: string): string {
  return text.replace(/^(?:[ \t]*\n)+/, '').replace(/(?:\n[ \t]*)+$/, '')
}

// ── Per-slide option blocks ────────────────────────────────────────────────────

const SLIDE_OPTION_KEYS = new Set(['id', 'title', 'layout', 'transition', 'notes', 'skip', 'skipped', 'background'])

/**
 * A block is a slide options block only when it parses as a YAML mapping whose keys are
 * ALL known slide options. Requiring every key to be known keeps prose that happens to
 * contain a colon from being swallowed as configuration.
 */
function parseOptionsBlock(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  // Must open with `key:` — cheap rejection before handing anything to the YAML parser.
  if (!/^[A-Za-z_][\w-]*[ \t]*:/.test(trimmed)) return null
  let raw: unknown
  try {
    raw = parseYaml(trimmed)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const keys = Object.keys(raw as Record<string, unknown>)
  if (keys.length === 0) return null
  if (!keys.every((k) => SLIDE_OPTION_KEYS.has(k))) return null
  return raw as Record<string, unknown>
}

// ── Fence info strings ─────────────────────────────────────────────────────────

const ATTR_RE = /([A-Za-z_][\w-]*)=(\[[^\]]*\]|"[^"]*"|'[^']*'|[^\s]+)/g

function parseAttrValue(raw: string): string | string[] {
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw
      .slice(1, -1)
      .split(',')
      .map((v) => unquote(v.trim()))
      .filter((v) => v.length > 0)
  }
  return unquote(raw)
}

function unquote(value: string): string {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1)
  }
  return value
}

interface FenceInfo {
  language: string
  attrs: Record<string, string | string[]>
}

function parseFenceInfo(info: string): FenceInfo {
  const trimmed = info.trim()
  const firstToken = trimmed.split(/\s+/)[0] ?? ''
  const language = firstToken.includes('=') ? '' : firstToken
  const attrs: Record<string, string | string[]> = {}
  for (const match of trimmed.matchAll(ATTR_RE)) {
    attrs[match[1]] = parseAttrValue(match[2])
  }
  return { language, attrs }
}

function asString(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined
  return Array.isArray(value) ? value.join(',') : value
}

function asList(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined
  if (Array.isArray(value)) return value
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

/**
 * Normalize an author-supplied `file=` into a deck-relative path. A bare name lands in
 * `code/`; anything that escapes the deck is rejected (null).
 */
function normalizeCodePath(raw: string): string | null {
  const cleaned = raw.trim().replace(/\\/g, '/').replace(/^\.\//, '')
  if (!cleaned) return null
  if (cleaned.startsWith('/') || cleaned.startsWith('~') || /^[A-Za-z]:\//.test(cleaned)) return null
  if (cleaned.split('/').includes('..')) return null
  return cleaned.includes('/') ? cleaned : `code/${cleaned}`
}

// ── Notes ──────────────────────────────────────────────────────────────────────

/** `<!-- notes -->` on its own line: everything after it is speaker notes. */
const NOTES_MARKER_RE = /^[ \t]*<!--[ \t]*notes[ \t]*(?::[ \t]*)?-->[ \t]*$/i

function splitNotes(body: string): { markdown: string; notes?: string } {
  const lines = body.split('\n')
  const index = lines.findIndex((line) => NOTES_MARKER_RE.test(line))
  if (index === -1) return { markdown: body }
  const notes = trimBlankLines(lines.slice(index + 1).join('\n'))
  return {
    markdown: lines.slice(0, index).join('\n'),
    notes: notes.length > 0 ? notes : undefined,
  }
}

// ── Code fence extraction ──────────────────────────────────────────────────────

interface ExtractedCode {
  markdown: string
  code?: { info: FenceInfo; source: string }
}

/**
 * Lift the first fenced block carrying `file=` out of the slide body. Fences without
 * `file=` (and any further `file=` fences) stay in the markdown as ordinary code.
 */
function extractCodeFence(body: string): ExtractedCode {
  const lines = body.split('\n')
  let fence: { char: string; len: number; start: number; info: FenceInfo } | null = null

  for (let i = 0; i < lines.length; i++) {
    const match = FENCE_RE.exec(lines[i])
    if (!match) continue
    const marker = match[1]
    if (!fence) {
      const info = parseFenceInfo(match[2])
      fence = { char: marker[0], len: marker.length, start: i, info }
      continue
    }
    const closes = marker[0] === fence.char && marker.length >= fence.len && match[2].trim() === ''
    if (!closes) continue
    if (fence.info.attrs.file !== undefined) {
      const source = lines.slice(fence.start + 1, i).join('\n')
      const remaining = [...lines.slice(0, fence.start), ...lines.slice(i + 1)]
      return { markdown: remaining.join('\n'), code: { info: fence.info, source } }
    }
    fence = null
  }
  return { markdown: body }
}

// ── Parsing ────────────────────────────────────────────────────────────────────

const HEADING_RE = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/

/** First ATX heading in the body, stripped of inline markdown, or null. */
function firstHeading(markdown: string): string | null {
  for (const line of markdown.split('\n')) {
    const match = HEADING_RE.exec(line)
    if (!match) continue
    const text = match[2]
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .trim()
    if (text) return text
  }
  return null
}

/** The id `parseSingleFileDeck` derives for a slide with this body at this position. */
function deriveSlideId(markdown: string, index: number, taken: Set<string>): string {
  const heading = firstHeading(markdown)
  const base = heading ? toSafeSlug(heading, `slide-${index + 1}`) : `slide-${index + 1}`
  return unique(base, taken)
}

/** Deck-level frontmatter keys we understand; everything else is carried through. */
const KNOWN_FRONTMATTER_KEYS = new Set([
  'title',
  'author',
  'theme',
  'lastViewedIndex',
  'ai',
  'groups',
  'presenterNotes',
])

export function parseSingleFileDeck(text: string): ParsedSingleFileDeck {
  const warnings: string[] = []
  const normalized = normalizeText(typeof text === 'string' ? text : '')
  const lines = normalized.split('\n')
  const blocks = splitBlocks(normalized)

  // Frontmatter is the first block only, and only when the file opens with `---`.
  let frontmatter: Record<string, unknown> = {}
  let bodyBlocks = blocks
  if (lines.length > 0 && SEPARATOR_RE.test(lines[0]) && blocks.length >= 3) {
    let raw: unknown
    try {
      raw = parseYaml(blocks[1])
    } catch (err) {
      warnings.push(`Frontmatter is not valid YAML (${(err as Error).message}); ignoring it.`)
      raw = null
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      frontmatter = raw as Record<string, unknown>
      bodyBlocks = blocks.slice(2)
    } else if (raw !== null) {
      warnings.push('Frontmatter is not a YAML mapping; ignoring it.')
    }
  }

  // Pair option blocks with the block that follows them.
  const raws: { body: string; options: Record<string, unknown> | null }[] = []
  let carried: Record<string, unknown> | null = null
  for (const block of bodyBlocks) {
    if (block.trim() === '') continue
    const options = parseOptionsBlock(block)
    if (options) {
      // Two option blocks in a row: the first one described a slide with no body.
      if (carried) raws.push({ body: '', options: carried })
      carried = options
      continue
    }
    raws.push({ body: block, options: carried })
    carried = null
  }
  if (carried) raws.push({ body: '', options: carried })

  const takenIds = new Set<string>()
  const slides: ParsedSingleFileSlide[] = raws.map((raw, index) => {
    const withoutNotes = splitNotes(raw.body)
    const extracted = extractCodeFence(withoutNotes.markdown)
    const markdown = trimBlankLines(extracted.markdown)
    const options = raw.options ?? {}

    const explicitId = typeof options.id === 'string' && options.id.trim() ? toSafeSlug(options.id.trim()) : null
    const id = explicitId ? unique(explicitId, takenIds) : deriveSlideId(markdown, index, takenIds)

    const slide: ParsedSingleFileSlide = { id, markdown }

    if (typeof options.title === 'string' && options.title.trim()) slide.title = options.title.trim()

    if (options.layout !== undefined) {
      if (isSlideLayout(options.layout)) slide.layout = options.layout
      else warnings.push(`Slide "${id}": unknown layout "${String(options.layout)}" — ignored.`)
    }
    if (options.transition !== undefined) {
      if (isSlideTransition(options.transition)) slide.transition = options.transition
      else warnings.push(`Slide "${id}": unknown transition "${String(options.transition)}" — ignored.`)
    }
    const skip = options.skip ?? options.skipped
    if (skip === true) slide.skipped = true
    if (typeof options.notes === 'string' && options.notes.trim()) {
      slide.notes = options.notes.trim()
    }
    if (options.background && typeof options.background === 'object' && !Array.isArray(options.background)) {
      slide.background = options.background as SlideBackground
    }
    // A `<!-- notes -->` block wins over `notes:` in the options block.
    if (withoutNotes.notes) slide.notes = withoutNotes.notes

    if (extracted.code) {
      const code = buildCode(extracted.code.info, extracted.code.source, id, warnings)
      if (code) slide.code = code
      else {
        // Unusable `file=` — put the fence back so the author still sees their code.
        slide.markdown = trimBlankLines(withoutNotes.markdown)
      }
    }

    return slide
  })

  const rawTitle = typeof frontmatter.title === 'string' ? frontmatter.title.trim() : ''
  const fallbackTitle = slides.length > 0 ? firstHeading(slides[0].markdown) : null
  const theme = typeof frontmatter.theme === 'string' ? frontmatter.theme.trim() : ''
  if (theme && !isSlideTheme(theme)) {
    warnings.push(`Unknown theme "${theme}" — falling back to "${DEFAULT_THEME}".`)
  }

  const config: PresentationInput = {
    title: rawTitle || fallbackTitle || 'Untitled',
    author: typeof frontmatter.author === 'string' ? frontmatter.author : '',
    theme: theme && isSlideTheme(theme) ? theme : DEFAULT_THEME,
  }
  if (typeof frontmatter.presenterNotes === 'string') config.presenterNotes = frontmatter.presenterNotes
  if (frontmatter.ai && typeof frontmatter.ai === 'object') config.ai = frontmatter.ai as AIConfig
  if (Array.isArray(frontmatter.groups)) config.groups = frontmatter.groups as SlideGroupConfig[]

  // Unknown frontmatter keys ride along; the shared serializer writes them back out.
  const extras = config as PresentationInput & Record<string, unknown>
  for (const [key, value] of Object.entries(frontmatter)) {
    if (KNOWN_FRONTMATTER_KEYS.has(key)) continue
    if (key === 'slides') {
      warnings.push('Frontmatter key "slides" is generated from the file itself — ignored.')
      continue
    }
    if (value !== undefined) extras[key] = value
  }

  return { config, slides, warnings }
}

function buildCode(
  info: FenceInfo,
  source: string,
  slideId: string,
  warnings: string[]
): SingleFileCode | null {
  const fileAttr = asString(info.attrs.file) ?? ''
  const file = normalizeCodePath(fileAttr)
  if (!file) {
    warnings.push(`Slide "${slideId}": code file "${fileAttr}" is not a path inside the deck — left inline.`)
    return null
  }

  const language = resolveLanguage(info.language) ?? detectLanguage(file)
  if (!language) {
    warnings.push(
      `Slide "${slideId}": cannot tell the language of "${file}" (fence tag "${info.language}") — left inline.`
    )
    return null
  }

  const requested = asString(info.attrs.execution)
  if (requested && !isExecutionEngine(requested)) {
    warnings.push(`Slide "${slideId}": unknown execution engine "${requested}" — using the default for ${language}.`)
  }
  const execution: ExecutionEngine =
    requested && isExecutionEngine(requested) ? requested : defaultEngineForLanguage(language)

  const code: SingleFileCode = { file, language, execution, source }

  const packages = asList(info.attrs.packages)
  if (packages && packages.length > 0) code.packages = packages
  const dependencies = asList(info.attrs.dependencies)
  if (dependencies && dependencies.length > 0) code.dependencies = dependencies
  const seedData = asString(info.attrs.seedData)
  if (seedData) {
    const normalizedSeed = normalizeCodePath(seedData)
    if (normalizedSeed) code.seedData = normalizedSeed
    else warnings.push(`Slide "${slideId}": seedData "${seedData}" is not a path inside the deck — ignored.`)
  }

  if (execution === 'native') {
    const command = asString(info.attrs.command)
    code.command = command || nativeCommandForLanguage(language) || language
    const args = asList(info.attrs.args)
    code.args = args && args.length > 0 ? args : [file]
  } else {
    const command = asString(info.attrs.command)
    if (command) code.command = command
    const args = asList(info.attrs.args)
    if (args && args.length > 0) code.args = args
  }

  return code
}

// ── Materializing to the folder format ─────────────────────────────────────────

/** Two digits for slides 1-99, natural width beyond that. */
function slideNumber(index: number): string {
  return String(index + 1).padStart(2, '0')
}

/**
 * Turn a parsed single file into the files a folder deck is made of. Pure: it decides
 * paths and content, the caller does the writing (manifest atomically, `code` files with
 * `writeFileIfMissing` so existing code is never truncated).
 *
 * `rootPath` only ends up in the returned manifest's runtime-only `rootPath` field; no
 * path is resolved or touched here.
 */
export function materializeToFolder(rootPath: string, parsed: ParsedSingleFileDeck): MaterializedDeck {
  const files: MaterializedFile[] = []
  const takenPaths = new Set<string>()

  const slideConfigs: SlideConfig[] = parsed.slides.map((slide, index) => {
    const contentPath = uniquePath(`slides/${slideNumber(index)}-${slide.id}.md`, takenPaths)
    files.push({
      relativePath: contentPath,
      content: slide.markdown.length > 0 ? `${slide.markdown}\n` : '',
      kind: 'slide',
    })

    const config: SlideConfig = {
      id: slide.id,
      content: contentPath,
      prompts: [],
      artifacts: [],
    }
    if (slide.title) config.title = slide.title
    if (slide.layout) config.layout = slide.layout
    if (slide.transition) config.transition = slide.transition
    if (slide.skipped) config.skipped = true
    if (slide.background) config.background = slide.background

    if (slide.code) {
      const codePath = uniquePath(slide.code.file, takenPaths)
      files.push({
        relativePath: codePath,
        content: slide.code.source.endsWith('\n') || slide.code.source === '' ? slide.code.source : `${slide.code.source}\n`,
        kind: 'code',
      })
      const { source: _source, ...codeConfig } = slide.code
      void _source
      const code: CodeBlockConfig = { ...codeConfig, file: codePath }
      // A renamed file must stay the thing `native` actually runs.
      if (code.args) code.args = code.args.map((arg) => (arg === slide.code!.file ? codePath : arg))
      config.code = code
    }

    if (slide.notes) {
      const notesPath = uniquePath(`slides/${slide.id}.notes.md`, takenPaths)
      files.push({ relativePath: notesPath, content: `${slide.notes}\n`, kind: 'notes' })
      config.notes = notesPath
    }

    return config
  })

  const draft = {
    ...(parsed.config as PresentationInput & Record<string, unknown>),
    slides: slideConfigs,
    rootPath,
  } as Presentation

  // Round-trip through the shared serializer + schema: what we hand back is exactly what
  // `lecta.yaml` will parse into, so a malformed deck fails here and not at load time.
  const yaml = serializePresentation(draft)
  const manifest = parsePresentationYaml(yaml, rootPath)

  files.unshift({ relativePath: 'lecta.yaml', content: yaml, kind: 'manifest' })
  return { manifest, files }
}

// ── Exporting a folder deck back to one file ───────────────────────────────────

function fenceFor(source: string): string {
  let longest = 0
  for (const match of source.matchAll(/`{3,}/g)) longest = Math.max(longest, match[0].length)
  return '`'.repeat(Math.max(3, longest + 1))
}

function attrValue(value: string): string {
  return /[\s"']/.test(value) ? `"${value.replace(/"/g, '')}"` : value
}

function listValue(values: string[]): string {
  return `[${values.map((v) => attrValue(v)).join(', ')}]`
}

/** A body line that is exactly `---` would re-split the slide; `----` renders the same. */
function escapeSeparators(markdown: string): string {
  let fence: { char: string; len: number } | null = null
  return markdown
    .split('\n')
    .map((line) => {
      const match = FENCE_RE.exec(line)
      if (match) {
        const marker = match[1]
        if (!fence) fence = { char: marker[0], len: marker.length }
        else if (marker[0] === fence.char && marker.length >= fence.len && match[2].trim() === '') fence = null
        return line
      }
      // Inside a fence a `---` line is code, and the parser never splits there.
      return !fence && SEPARATOR_RE.test(line) ? '----' : line
    })
    .join('\n')
}

function codeFence(code: CodeBlockConfig, source: string): string {
  const attrs = [`file=${attrValue(code.file)}`, `execution=${code.execution}`]
  if (code.packages && code.packages.length > 0) attrs.push(`packages=${listValue(code.packages)}`)
  if (code.dependencies && code.dependencies.length > 0) attrs.push(`dependencies=${listValue(code.dependencies)}`)
  if (code.seedData) attrs.push(`seedData=${attrValue(code.seedData)}`)

  const defaultCommand = nativeCommandForLanguage(code.language) || code.language
  const commandIsDefault = code.execution === 'native' && code.command === defaultCommand
  if (code.command && !commandIsDefault) attrs.push(`command=${attrValue(code.command)}`)

  const argsAreDefault =
    code.execution === 'native' && code.args?.length === 1 && code.args[0] === code.file
  if (code.args && code.args.length > 0 && !argsAreDefault) attrs.push(`args=${listValue(code.args)}`)

  const fence = fenceFor(source)
  const body = source.replace(/\n+$/, '')
  return `${fence}${code.language} ${attrs.join(' ')}\n${body}\n${fence}`
}

/**
 * Render a folder deck back into one markdown file — the inverse of
 * `parseSingleFileDeck` + `materializeToFolder`. Feeding the result back through
 * `parseSingleFileDeck` reproduces the same slides.
 */
export function folderToSingleFile(config: PresentationInput, slides: SingleFileSlideSource[]): string {
  const front: Record<string, unknown> = {
    title: config.title,
    author: config.author ?? '',
    theme: config.theme || DEFAULT_THEME,
  }
  if (config.presenterNotes) front.presenterNotes = config.presenterNotes
  if (config.ai) front.ai = config.ai

  const parts: string[] = [`---\n${stringifyYaml(front, { lineWidth: 120 }).trimEnd()}\n---`]

  const takenIds = new Set<string>()
  slides.forEach((slide, index) => {
    const markdown = trimBlankLines(escapeSeparators(slide.markdownContent ?? ''))
    const derivedId = deriveSlideId(markdown, index, takenIds)

    const options: Record<string, unknown> = {}
    if (slide.config.id && slide.config.id !== derivedId) options.id = slide.config.id
    if (slide.config.title) options.title = slide.config.title
    if (slide.config.layout && slide.config.layout !== 'default') options.layout = slide.config.layout
    if (slide.config.transition && slide.config.transition !== 'none') options.transition = slide.config.transition
    if (slide.config.skipped) options.skip = true
    if (slide.config.background && Object.values(slide.config.background).some((v) => v !== undefined && v !== '')) {
      options.background = slide.config.background
    }
    if (Object.keys(options).length > 0) {
      // The block's opening `---` doubles as the separator from the previous slide.
      parts.push(`---\n${stringifyYaml(options, { lineWidth: 120 }).trimEnd()}\n---`)
    } else if (index > 0) {
      parts.push('---')
    }

    const body: string[] = []
    if (markdown) body.push(markdown)
    if (slide.config.code && slide.codeContent != null) {
      body.push(codeFence(slide.config.code, slide.codeContent))
    }
    const notes = (slide.notesContent ?? '').trim()
    if (notes) body.push(`<!-- notes -->\n${notes}`)
    parts.push(body.join('\n\n'))
  })

  return `${parts.join('\n\n')}\n`
}
