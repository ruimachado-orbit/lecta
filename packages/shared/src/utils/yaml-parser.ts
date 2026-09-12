import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { z } from 'zod'
import type { Presentation, SlideConfig } from '../types/presentation'
import {
  CODE_LANGUAGES,
  DEFAULT_THEME,
  EXECUTION_ENGINES,
  SLIDE_LAYOUTS,
  SLIDE_THEMES,
  SLIDE_TRANSITIONS,
  isSlideTheme,
} from '../slide-options'

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

export function parsePresentationYaml(yamlContent: string, rootPath: string): Presentation {
  const raw = parseYaml(yamlContent)
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

    // Anything the schema did not name (a slide-level key from a newer version) survives.
    for (const [key, value] of Object.entries(s as unknown as Record<string, unknown>)) {
      if (!(key in slide) && value !== undefined) slide[key] = value
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

  return stringifyYaml(out, { lineWidth: 120 })
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
