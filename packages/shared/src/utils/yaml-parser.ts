import { parse as parseYaml, parseDocument, stringify as stringifyYaml } from 'yaml'
import { z } from 'zod'
import type { Presentation, SlideConfig } from '../types/presentation.js'
import {
  CODE_LANGUAGES,
  DEFAULT_THEME,
  EXECUTION_ENGINES,
  SLIDE_LAYOUTS,
  SLIDE_THEMES,
  SLIDE_TRANSITIONS,
  isSlideTheme,
} from '../slide-options.js'

/**
 * Every path inside a deck manifest is resolved against the deck folder, so it must be
 * relative and must not escape it. Rejecting here means the loader never has to.
 */
function deckRelativePath(field: string) {
  return z
    .string()
    .min(1, `${field} must not be empty`)
    .refine((p) => !/^([a-zA-Z]:[\\/]|[\\/]|~)/.test(p), {
      message: `${field} must be a relative path inside the deck folder`,
    })
    .refine((p) => !p.split(/[\\/]/).includes('..'), {
      message: `${field} must not contain ".." path segments`,
    })
}

const ArtifactConfigSchema = z.object({
  path: deckRelativePath('artifacts[].path'),
  label: z.string(),
})

const CodeBlockConfigSchema = z.object({
  file: deckRelativePath('code.file'),
  language: z.enum(CODE_LANGUAGES),
  execution: z.enum(EXECUTION_ENGINES),
  dependencies: z.array(z.string()).optional(),
  packages: z.array(z.string()).optional(),
  seedData: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
})

const VideoConfigSchema = z.object({
  url: z.string(),
  label: z.string().optional(),
})

const WebAppConfigSchema = z.object({
  url: z.string(),
  label: z.string().optional(),
})

const PromptConfigSchema = z.object({
  prompt: z.string(),
  label: z.string().optional(),
  response: z.string().optional(),
})

/**
 * Per-slide backdrop. Every field is optional; an empty object is dropped on serialize so
 * a background that was cleared does not linger in the manifest.
 */
const SlideBackgroundSchema = z.object({
  color: z.string().optional(),
  gradient: z.string().optional(),
  image: deckRelativePath('background.image').optional(),
  overlay: z.number().min(0).max(100).optional(),
})

const SlideConfigSchema = z.object({
  id: z.string().min(1, 'slide id must not be empty'),
  title: z.string().optional(),
  content: deckRelativePath('content'),
  code: CodeBlockConfigSchema.optional(),
  video: VideoConfigSchema.optional(),
  webapp: WebAppConfigSchema.optional(),
  prompts: z.array(PromptConfigSchema).default([]),
  artifacts: z.array(ArtifactConfigSchema).default([]),
  notes: deckRelativePath('notes').optional(),
  transition: z.enum(SLIDE_TRANSITIONS).optional(),
  layout: z.enum(SLIDE_LAYOUTS).optional(),
  drawings: z.string().optional(),
  skipped: z.boolean().optional(),
  background: SlideBackgroundSchema.optional(),
})

const AIConfigSchema = z.object({
  model: z.string().optional(),
  autoGenerateNotes: z.boolean().optional(),
  context: z.enum(['slide', 'code', 'slide+code']).optional(),
})

const SlideGroupConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  slideIds: z.array(z.string()),
  color: z.string().optional(),
})

/**
 * A theme the app does not know about must not make an existing deck unopenable —
 * it falls back to the default and warns instead.
 */
const ThemeSchema = z
  .string()
  .default(DEFAULT_THEME)
  .transform((theme) => {
    if (isSlideTheme(theme)) return theme
    console.warn(
      `[lecta] Unknown theme "${theme}" in lecta.yaml — falling back to "${DEFAULT_THEME}". ` +
        `Known themes: ${SLIDE_THEMES.join(', ')}.`
    )
    return DEFAULT_THEME
  })

/**
 * `.passthrough()` keeps top-level keys the app does not know about (user annotations,
 * keys written by a newer version) so `serializePresentation` can write them back.
 */
const PresentationSchema = z
  .object({
    title: z.string(),
    author: z.string(),
    theme: ThemeSchema,
    lastViewedIndex: z.number().int().nonnegative().optional(),
    slides: z.array(SlideConfigSchema),
    ai: AIConfigSchema.optional(),
    groups: z.array(SlideGroupConfigSchema).optional(),
    presenterNotes: z.string().optional(),
  })
  .passthrough()

/**
 * Slide keys the schema names. `serializePresentation` decides for each of them whether
 * it belongs in the output — `layout: default`, `transition: none` and an empty
 * `prompts` list are deliberately dropped — so they must be excluded from the
 * unknown-key passthrough below, which would otherwise put the defaults straight back.
 */
const KNOWN_SLIDE_KEYS: ReadonlySet<string> = new Set(Object.keys(SlideConfigSchema.shape))

/** Top-level keys `serializePresentation` writes itself, in this order. */
const KNOWN_TOP_LEVEL_KEYS = [
  'title',
  'author',
  'theme',
  'lastViewedIndex',
  'slides',
  'ai',
  'groups',
  'presenterNotes',
] as const

/** Never written back to disk — injected by the loader, not part of the manifest. */
const RUNTIME_ONLY_KEYS = new Set<string>(['rootPath'])

/** Leading `#` comments captured per deck root on the last parse (see below). */
const headerCommentsByRoot = new Map<string, string[]>()

/**
 * Remember a document's leading comments so `serializePresentation` can re-emit
 * them. Only full-line comments before the first key are kept — inline comments
 * cannot survive the zod round-trip and are deliberately excluded.
 */
export function rememberDocumentComments(yamlContent: string, rootPath: string): void {
  try {
    const doc = parseDocument(yamlContent)
    // `yaml` v2 attaches comments before the first key to that key's
    // `commentBefore`, not to the document — check both places.
    const contents = doc.contents as
      | { commentBefore?: string; items?: Array<{ key?: { commentBefore?: string } }> }
      | null
      | undefined
    const raw =
      doc.commentBefore ??
      contents?.commentBefore ??
      contents?.items?.[0]?.key?.commentBefore ??
      null
    if (!raw) {
      headerCommentsByRoot.delete(rootPath)
      return
    }
    const lines = raw
      .split('\n')
      .map((l) => l.trimEnd())
      .filter((l) => l.length > 0)
    if (lines.length > 0) headerCommentsByRoot.set(rootPath, lines)
    else headerCommentsByRoot.delete(rootPath)
  } catch {
    // A file we cannot parse keeps whatever header we remembered before.
  }
}

export function parsePresentationYaml(yamlContent: string, rootPath: string): Presentation {
  const raw = parseYaml(yamlContent)
  rememberDocumentComments(yamlContent, rootPath)
  const parsed = PresentationSchema.parse(raw)

  return {
    ...parsed,
    rootPath,
    slides: parsed.slides as SlideConfig[],
  } as Presentation
}

/**
 * Serialize a presentation back to `lecta.yaml`, preserving any unknown top-level keys
 * that `parsePresentationYaml` carried through. Round-trips
 * `parse → serialize → parse` without losing user-authored keys.
 *
 * YAML comments are preserved on a best-effort basis: leading comments from the
 * last-parsed document for the same `rootPath` (see `rememberDocumentComments`)
 * are re-emitted above the serialized manifest, so hand-written headers like
 * `# My deck — do not reorder` survive a save. Inline comments are still dropped
 * (the `yaml` AST is not round-tripped through the zod schema); that is tracked
 * as a known limitation, not silent data loss.
 */
export function serializePresentation(config: Presentation): string {
  const source = config as Presentation & Record<string, unknown>

  const out: Record<string, unknown> = {
    title: config.title,
    author: config.author,
    theme: config.theme,
  }
  if (config.lastViewedIndex != null && config.lastViewedIndex > 0) {
    out.lastViewedIndex = config.lastViewedIndex
  }

  out.slides = config.slides.map((s) => {
    const slide: Record<string, unknown> = { id: s.id }
    if (s.title) slide.title = s.title
    slide.content = s.content
    if (s.code) slide.code = s.code
    if (s.video) slide.video = s.video
    if (s.webapp) slide.webapp = s.webapp
    if (s.prompts && s.prompts.length > 0) slide.prompts = s.prompts
    slide.artifacts = s.artifacts ?? []
    if (s.notes) slide.notes = s.notes
    if (s.transition && s.transition !== 'none') slide.transition = s.transition
    if (s.layout && s.layout !== 'default') slide.layout = s.layout
    if (s.drawings) slide.drawings = s.drawings
    if (s.skipped) slide.skipped = true
    if (s.background && Object.values(s.background).some((v) => v !== undefined && v !== '')) {
      slide.background = s.background
    }

    // Anything the schema did not name (a slide-level key from a newer version) survives.
    for (const [key, value] of Object.entries(s as unknown as Record<string, unknown>)) {
      if (KNOWN_SLIDE_KEYS.has(key) || value === undefined) continue
      slide[key] = value
    }
    return slide
  })

  if (config.ai) out.ai = config.ai
  if (config.groups && config.groups.length > 0) {
    out.groups = config.groups.map((g) => {
      const group: Record<string, unknown> = { id: g.id, name: g.name, slideIds: g.slideIds }
      if (g.color) group.color = g.color
      return group
    })
  }
  if (config.presenterNotes) out.presenterNotes = config.presenterNotes

  for (const [key, value] of Object.entries(source)) {
    if ((KNOWN_TOP_LEVEL_KEYS as readonly string[]).includes(key)) continue
    if (RUNTIME_ONLY_KEYS.has(key)) continue
    if (value === undefined) continue
    out[key] = value
  }

  const body = stringifyYaml(out, { lineWidth: 120 })
  const header = headerCommentsByRoot.get(
    (config as Presentation & { rootPath?: string }).rootPath ?? ''
  )
  if (!header || header.length === 0) return body
  const normalized = header
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => (l.startsWith('#') ? l.replace(/^#\s?/, '# ') : `# ${l}`))
  return `${normalized.join('\n')}\n${body}`
}

export function validatePresentationYaml(yamlContent: string): {
  valid: boolean
  errors: string[]
} {
  try {
    const raw = parseYaml(yamlContent)
    PresentationSchema.parse(raw)
    return { valid: true, errors: [] }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        errors: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
      }
    }
    return {
      valid: false,
      errors: [(error as Error).message],
    }
  }
}
