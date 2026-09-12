import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, basename } from 'path'
import { stringify as stringifyYaml } from 'yaml'
import { z } from 'zod'
import { DECK_CONFIG_FILE } from '../../../packages/shared/src/constants'
import type { SupportedLanguage, ExecutionEngine } from '../../../packages/shared/src/types/presentation'
import type { CellOutput, CellType, NotebookKernel } from '../../../packages/shared/src/types/notebook'

// ── Jupyter notebook JSON structure ─────────────────────────────
//
// Notebooks in the wild deviate from the spec (a `source` that is not a string or an
// array, `outputs: [null]`, missing `metadata`), so every cell and output is validated
// and anything malformed is skipped with a warning rather than aborting the import.

const StringOrLines = z.union([z.string(), z.array(z.string())])

const JupyterOutputSchema = z
  .object({
    output_type: z.string(),
    name: z.string().optional(),
    text: StringOrLines.optional(),
    data: z.record(z.unknown()).optional(),
    execution_count: z.number().nullable().optional(),
    ename: z.string().optional(),
    evalue: z.string().optional(),
    traceback: z.array(z.string()).optional()
  })
  .passthrough()

const JupyterCellSchema = z
  .object({
    cell_type: z.string(),
    source: StringOrLines.default(''),
    metadata: z.record(z.unknown()).optional(),
    /** Markdown cells may embed images referenced as `![alt](attachment:name)`. */
    attachments: z.record(z.record(StringOrLines)).optional(),
    outputs: z.array(z.unknown()).optional(),
    execution_count: z.number().nullable().optional()
  })
  .passthrough()

const JupyterNotebookSchema = z
  .object({
    cells: z.array(z.unknown()),
    metadata: z
      .object({
        kernelspec: z
          .object({ display_name: z.string().optional(), language: z.string().optional(), name: z.string().optional() })
          .passthrough()
          .optional(),
        language_info: z.object({ name: z.string().optional(), version: z.string().optional() }).passthrough().optional()
      })
      .passthrough()
      .default({}),
    nbformat: z.number().optional(),
    nbformat_minor: z.number().optional()
  })
  .passthrough()

type JupyterNotebook = z.infer<typeof JupyterNotebookSchema>
type JupyterCell = z.infer<typeof JupyterCellSchema>
type JupyterOutput = z.infer<typeof JupyterOutputSchema>

// ── Language / engine mapping ───────────────────────────────────

const LANGUAGE_EXTENSION_MAP: Record<string, string> = {
  python: '.py',
  javascript: '.js',
  typescript: '.ts',
  sql: '.sql',
  r: '.r',
  julia: '.jl'
}

const LANGUAGE_TO_SUPPORTED: Record<string, SupportedLanguage> = {
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  sql: 'sql'
}

const LANGUAGE_TO_ENGINE: Record<string, ExecutionEngine> = {
  python: 'pyodide',
  javascript: 'sandpack',
  typescript: 'sandpack',
  sql: 'sql'
}

/** Kernel ids the app understands. R and Julia are imported, just not runnable. */
const LANGUAGE_TO_KERNEL: Record<string, NotebookKernel> = {
  python: 'python', javascript: 'javascript', typescript: 'typescript',
  sql: 'sql', bash: 'bash', go: 'go', rust: 'rust', r: 'r', julia: 'julia'
}

/** Output MIME types we can turn into a file, in preference order. */
const IMAGE_MIME_EXTENSIONS: [string, string][] = [
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/svg+xml', '.svg']
]

/** CSI escape sequences — Jupyter tracebacks are full of colour codes. */
const ANSI_ESCAPE = /[\u001B\u009B][[\]()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><]/g

function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE, '')
}

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Normalise the `source` field which may be a single string or an array.
 */
function joinSource(source: string | string[] | undefined): string {
  if (!source) return ''
  if (typeof source === 'string') return source
  return source.join('')
}

/**
 * Normalise a text/string-array field from an output.
 */
function joinText(text: unknown): string {
  if (text == null) return ''
  if (typeof text === 'string') return text
  if (Array.isArray(text)) return text.filter((t) => typeof t === 'string').join('')
  return ''
}

/**
 * Zero-pad a number to two digits.
 */
function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Detect kernel language from notebook metadata, defaulting to python.
 */
function detectLanguage(nb: JupyterNotebook): string {
  const lang =
    nb.metadata?.kernelspec?.language ??
    nb.metadata?.language_info?.name ??
    nb.metadata?.kernelspec?.name ??
    'python'
  // `ir` is IRkernel's name for R; `julia-1.10` carries the version in the kernel name.
  const normalised = lang.toLowerCase()
  if (normalised === 'ir') return 'r'
  if (normalised.startsWith('julia')) return 'julia'
  if (normalised.startsWith('python')) return 'python'
  return normalised
}

/**
 * Extract a title from the first markdown cell (if its first line starts
 * with `#`), falling back to the notebook filename.
 */
function extractTitle(cells: JupyterCell[], filename: string): string {
  for (const cell of cells) {
    if (cell.cell_type !== 'markdown') continue
    const src = joinSource(cell.source).trimStart()
    if (!src) continue
    const firstLine = src.split('\n')[0]
    if (firstLine.startsWith('#')) {
      return firstLine.replace(/^#+\s*/, '').trim()
    }
    break // only inspect the *first* markdown cell
  }
  // Fallback: filename without extension
  return basename(filename, '.ipynb')
}

// ── Output conversion ───────────────────────────────────────────

/**
 * Convert a single Jupyter output to a Lecta CellOutput, optionally
 * saving image data to the artifacts directory.
 */
async function convertOutput(
  output: JupyterOutput,
  cellNum: string,
  outputIdx: number,
  workspaceDir: string
): Promise<CellOutput | null> {
  switch (output.output_type) {
    case 'stream': {
      const text = joinText(output.text)
      if (!text) return null
      return { outputType: 'stream', text }
    }

    case 'execute_result':
    case 'display_data': {
      const data = output.data
      if (!data) return null

      const result: CellOutput = { outputType: output.output_type }

      // Images: PNG, JPEG and SVG are all common matplotlib/plotly outputs.
      for (const [mime, ext] of IMAGE_MIME_EXTENSIONS) {
        const payload = joinText(data[mime])
        if (!payload) continue
        const artifactPath = `artifacts/output-${cellNum}-${outputIdx}${ext}`
        // SVG is inline XML in the notebook; the raster formats are base64.
        const contents = mime === 'image/svg+xml' ? Buffer.from(payload, 'utf-8') : Buffer.from(payload, 'base64')
        await writeFile(join(workspaceDir, artifactPath), contents)
        result.imageData = artifactPath
        break
      }

      const htmlData = joinText(data['text/html'])
      if (htmlData) result.html = htmlData

      // text/plain is the canonical fallback; text/markdown is used by IPython.display.Markdown.
      const plainData = joinText(data['text/plain'])
      const markdownData = joinText(data['text/markdown'])
      if (plainData) result.text = plainData
      else if (markdownData) result.text = markdownData

      // If nothing meaningful was extracted, skip
      if (!result.imageData && !result.html && !result.text) return null
      return result
    }

    case 'error': {
      // Tracebacks arrive full of ANSI colour codes, which render as mojibake.
      const message = stripAnsi(output.evalue ?? '').trim()
      const name = output.ename?.trim()
      return {
        outputType: 'error',
        text: [name, message].filter(Boolean).join(': ') || 'Unknown error',
        traceback: (output.traceback ?? []).map(stripAnsi)
      }
    }

    default:
      return null
  }
}

/**
 * Write a markdown cell's `attachments` into artifacts/ and rewrite the
 * `![alt](attachment:name)` references to point at the extracted files.
 */
async function extractAttachments(
  cell: JupyterCell,
  cellNum: string,
  workspaceDir: string
): Promise<{ source: string; artifacts: { path: string; label: string }[] }> {
  let source = joinSource(cell.source)
  const artifacts: { path: string; label: string }[] = []
  if (!cell.attachments) return { source, artifacts }

  let index = 0
  for (const [name, mimeBundle] of Object.entries(cell.attachments)) {
    const entry = IMAGE_MIME_EXTENSIONS.find(([mime]) => joinText(mimeBundle[mime]))
    if (!entry) continue
    const [mime, ext] = entry
    const payload = joinText(mimeBundle[mime])
    const artifactPath = `artifacts/attachment-${cellNum}-${index++}${ext}`
    const contents = mime === 'image/svg+xml' ? Buffer.from(payload, 'utf-8') : Buffer.from(payload, 'base64')
    await writeFile(join(workspaceDir, artifactPath), contents)

    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    source = source.replace(new RegExp(`attachment:${escaped}`, 'g'), artifactPath)
    artifacts.push({ path: artifactPath, label: name })
  }

  return { source, artifacts }
}

// ── Main import function ────────────────────────────────────────

/**
 * Import a Jupyter notebook (.ipynb) and convert it into a Lecta
 * notebook workspace at `workspaceDir`.
 */
export async function importIpynb(ipynbPath: string, workspaceDir: string): Promise<void> {
  // 1. Read and parse the notebook
  const raw = await readFile(ipynbPath, 'utf-8')
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw new Error(`Failed to parse Jupyter notebook: ${ipynbPath}`)
  }

  const notebookResult = JupyterNotebookSchema.safeParse(json)
  if (!notebookResult.success) {
    throw new Error(`Invalid notebook: missing "cells" array in ${ipynbPath}`)
  }
  const nb = notebookResult.data

  // Validate cells individually so one malformed cell does not fail the whole import.
  const cells: JupyterCell[] = []
  nb.cells.forEach((rawCell, index) => {
    const parsed = JupyterCellSchema.safeParse(rawCell)
    if (parsed.success) cells.push(parsed.data)
    else console.warn(`[ipynb-importer] Skipping malformed cell ${index + 1} in ${ipynbPath}: ${parsed.error.message}`)
  })

  // 2. Create workspace structure
  await mkdir(join(workspaceDir, 'pages'), { recursive: true })
  await mkdir(join(workspaceDir, 'code'), { recursive: true })
  await mkdir(join(workspaceDir, 'artifacts'), { recursive: true })

  // 3. Detect kernel language
  const kernelLanguage = detectLanguage(nb)
  const fileExtension = LANGUAGE_EXTENSION_MAP[kernelLanguage] ?? '.py'
  const supportedLanguage: SupportedLanguage = LANGUAGE_TO_SUPPORTED[kernelLanguage] ?? 'python'
  const executionEngine: ExecutionEngine = LANGUAGE_TO_ENGINE[kernelLanguage] ?? 'none'

  // 4. Determine title
  const title = extractTitle(cells, basename(ipynbPath))

  // 5. Iterate over cells and build page configs
  interface PageConfig {
    id: string
    content: string
    cellType: CellType
    cellIndex: number
    code?: {
      file: string
      language: SupportedLanguage
      execution: ExecutionEngine
    }
    outputs?: CellOutput[]
    createdAt: string
    artifacts: { path: string; label: string }[]
  }

  const pages: PageConfig[] = []
  const now = new Date().toISOString()

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    const num = pad(i + 1)
    const cellId = `cell-${num}`
    const mdRelPath = `pages/${cellId}.md`
    const source = joinSource(cell.source)

    switch (cell.cell_type) {
      case 'markdown': {
        const { source: markdown, artifacts } = await extractAttachments(cell, num, workspaceDir)
        await writeFile(join(workspaceDir, mdRelPath), markdown, 'utf-8')
        pages.push({
          id: cellId,
          content: mdRelPath,
          cellType: 'markdown',
          cellIndex: i,
          createdAt: now,
          artifacts
        })
        break
      }

      case 'code': {
        // Write code file
        const codeRelPath = `code/${cellId}${fileExtension}`
        await writeFile(join(workspaceDir, codeRelPath), source, 'utf-8')

        // Write minimal markdown page
        await writeFile(
          join(workspaceDir, mdRelPath),
          `<!-- Code Cell ${i + 1} -->\n`,
          'utf-8'
        )

        // Convert outputs
        const outputs: CellOutput[] = []
        const cellArtifacts: { path: string; label: string }[] = []

        if (Array.isArray(cell.outputs)) {
          for (let oi = 0; oi < cell.outputs.length; oi++) {
            const parsedOutput = JupyterOutputSchema.safeParse(cell.outputs[oi])
            if (!parsedOutput.success) {
              console.warn(`[ipynb-importer] Skipping malformed output ${oi + 1} of cell ${i + 1} in ${ipynbPath}`)
              continue
            }
            const converted = await convertOutput(parsedOutput.data, num, oi, workspaceDir)
            if (converted) {
              outputs.push(converted)
              if (converted.imageData) {
                cellArtifacts.push({
                  path: converted.imageData,
                  label: `Output ${oi + 1}`
                })
              }
            }
          }
        }

        const page: PageConfig = {
          id: cellId,
          content: mdRelPath,
          cellType: 'code',
          cellIndex: i,
          code: {
            file: codeRelPath,
            language: supportedLanguage,
            execution: executionEngine
          },
          createdAt: now,
          artifacts: cellArtifacts
        }
        if (outputs.length > 0) {
          page.outputs = outputs
        }
        pages.push(page)
        break
      }

      case 'raw': {
        // Wrap raw content in code fences
        const wrapped = '```\n' + source + '\n```\n'
        await writeFile(join(workspaceDir, mdRelPath), wrapped, 'utf-8')
        pages.push({
          id: cellId,
          content: mdRelPath,
          cellType: 'raw',
          cellIndex: i,
          createdAt: now,
          artifacts: []
        })
        break
      }

      default: {
        // Unknown cell type — treat as raw
        await writeFile(join(workspaceDir, mdRelPath), source || '', 'utf-8')
        pages.push({
          id: cellId,
          content: mdRelPath,
          cellType: 'raw',
          cellIndex: i,
          createdAt: now,
          artifacts: []
        })
        break
      }
    }
  }

  // If the notebook had no cells, create a placeholder
  if (pages.length === 0) {
    const placeholderPath = 'pages/cell-01.md'
    await writeFile(
      join(workspaceDir, placeholderPath),
      '# Empty Notebook\n\nNo cells were found in the imported notebook.\n',
      'utf-8'
    )
    pages.push({
      id: 'cell-01',
      content: placeholderPath,
      cellType: 'markdown',
      cellIndex: 0,
      createdAt: now,
      artifacts: []
    })
  }

  // 6. Generate lecta.yaml — an R or Julia notebook must not be mislabelled as python.
  const kernel: NotebookKernel = LANGUAGE_TO_KERNEL[kernelLanguage] ?? 'python'

  const config: Record<string, unknown> = {
    type: 'notebook',
    title,
    author: '',
    theme: 'dark',
    defaultLayout: 'jupyter',
    sourceFormat: 'jupyter',
    kernel,
    pages
  }

  const yamlContent = stringifyYaml(config, {
    lineWidth: 0,
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN'
  })

  await writeFile(join(workspaceDir, DECK_CONFIG_FILE), yamlContent, 'utf-8')
}
