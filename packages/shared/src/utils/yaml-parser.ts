import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import type { Presentation, SlideConfig } from '../types/presentation'

const ArtifactConfigSchema = z.object({
  path: z.string(),
  label: z.string()
})

const CodeBlockConfigSchema = z.object({
  file: z.string(),
  language: z.enum([
    'javascript', 'typescript', 'python', 'sql', 'html', 'css',
    'json', 'bash', 'rust', 'go', 'java', 'csharp', 'ruby', 'php', 'markdown'
  ]),
  execution: z.enum(['sandpack', 'pyodide', 'sql', 'native', 'none']),
  dependencies: z.array(z.string()).optional(),
  packages: z.array(z.string()).optional(),
  seedData: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional()
})

const VideoConfigSchema = z.object({
  url: z.string(),
  label: z.string().optional()
})

const WebAppConfigSchema = z.object({
  url: z.string(),
  label: z.string().optional()
})

const SlideConfigSchema = z.object({
  id: z.string(),
  content: z.string(),
  code: CodeBlockConfigSchema.optional(),
  video: VideoConfigSchema.optional(),
  webapp: WebAppConfigSchema.optional(),
  artifacts: z.array(ArtifactConfigSchema).default([]),
  notes: z.string().optional(),
  transition: z.enum(['none', 'left', 'right', 'top', 'bottom']).optional(),
  layout: z.enum([
    'default', 'center', 'title', 'section', 'two-col', 'two-col-wide-left',
    'two-col-wide-right', 'three-col', 'top-bottom', 'big-number', 'quote', 'blank'
  ]).optional(),
  drawings: z.string().optional()
})

const AIConfigSchema = z.object({
  model: z.string().optional(),
  autoGenerateNotes: z.boolean().optional(),
  context: z.enum(['slide', 'code', 'slide+code']).optional()
})

const SlideGroupConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  slideIds: z.array(z.string())
})

const PresentationSchema = z.object({
  title: z.string(),
  author: z.string(),
  theme: z.string().default('dark'),
  slides: z.array(SlideConfigSchema),
  ai: AIConfigSchema.optional(),
  groups: z.array(SlideGroupConfigSchema).optional()
})

export function parsePresentationYaml(yamlContent: string, rootPath: string): Presentation {
  const raw = parseYaml(yamlContent)
  const parsed = PresentationSchema.parse(raw)

  return {
    ...parsed,
    rootPath,
    slides: parsed.slides as SlideConfig[]
  }
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
        errors: error.errors.map(
          (e) => `${e.path.join('.')}: ${e.message}`
        )
      }
    }
    return {
      valid: false,
      errors: [(error as Error).message]
    }
  }
}
