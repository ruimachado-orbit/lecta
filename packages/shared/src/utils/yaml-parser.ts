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
    'json', 'bash', 'rust', 'go', 'java', 'csharp', 'ruby', 'php'
  ]),
  execution: z.enum(['sandpack', 'pyodide', 'sql', 'native', 'none']),
  dependencies: z.array(z.string()).optional(),
  packages: z.array(z.string()).optional(),
  seedData: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional()
})

const SlideConfigSchema = z.object({
  id: z.string(),
  content: z.string(),
  code: CodeBlockConfigSchema.optional(),
  artifacts: z.array(ArtifactConfigSchema).default([]),
  notes: z.string().optional()
})

const AIConfigSchema = z.object({
  model: z.string().optional(),
  autoGenerateNotes: z.boolean().optional(),
  context: z.enum(['slide', 'code', 'slide+code']).optional()
})

const PresentationSchema = z.object({
  title: z.string(),
  author: z.string(),
  theme: z.string().default('dark'),
  slides: z.array(SlideConfigSchema),
  ai: AIConfigSchema.optional()
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
