import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import type { Notebook, NoteConfig } from '../types/notebook'

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

const NoteLayoutSchema = z.enum(['lines', 'blank', 'agenda', 'grid'])

// Recursive schema for notes with children
const BaseNoteConfigSchema = z.object({
  id: z.string(),
  content: z.string(),
  layout: NoteLayoutSchema.optional(),
  createdAt: z.string().default(() => new Date().toISOString()),
  artifacts: z.array(ArtifactConfigSchema).default([]),
  code: CodeBlockConfigSchema.optional()
})

type NoteConfigSchemaType = z.ZodType<NoteConfig>
const NoteConfigSchema: NoteConfigSchemaType = BaseNoteConfigSchema.extend({
  children: z.lazy(() => z.array(NoteConfigSchema)).optional()
}) as any

const NotebookSchema = z.object({
  type: z.literal('notebook'),
  title: z.string(),
  author: z.string().default(''),
  theme: z.string().default('dark'),
  defaultLayout: NoteLayoutSchema.default('lines'),
  pages: z.array(NoteConfigSchema)
})

export function parseNotebookYaml(yamlContent: string, rootPath: string): Notebook {
  const raw = parseYaml(yamlContent)
  const parsed = NotebookSchema.parse(raw)

  return {
    ...parsed,
    rootPath,
    pages: parsed.pages as NoteConfig[]
  }
}

export function validateNotebookYaml(yamlContent: string): {
  valid: boolean
  errors: string[]
} {
  try {
    const raw = parseYaml(yamlContent)
    NotebookSchema.parse(raw)
    return { valid: true, errors: [] }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        errors: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`)
      }
    }
    return { valid: false, errors: [(error as Error).message] }
  }
}

/**
 * Detect if a YAML string represents a notebook (has type: notebook).
 */
export function isNotebookYaml(yamlContent: string): boolean {
  try {
    const raw = parseYaml(yamlContent)
    return raw?.type === 'notebook'
  } catch {
    return false
  }
}
