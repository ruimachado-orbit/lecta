import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, basename } from 'path'
import { stringify as stringifyYaml } from 'yaml'
import { DECK_CONFIG_FILE } from '../../../packages/shared/src/constants'
import type { SupportedLanguage, ExecutionEngine } from '../../../packages/shared/src/types/presentation'
import type { CellOutput, CellType } from '../../../packages/shared/src/types/notebook'

// ── Jupyter notebook JSON structure ─────────────────────────────

interface JupyterNotebook {
  cells: JupyterCell[]
  metadata: {
    kernelspec?: { display_name?: string; language?: string; name?: string }
    language_info?: { name?: string; version?: string }
  }
  nbformat: number
  nbformat_minor: number
}

interface JupyterCell {
  cell_type: 'markdown' | 'code' | 'raw'
  source: string | string[]
  metadata: Record<string, unknown>
  outputs?: JupyterOutput[]
  execution_count?: number | null
}

interface JupyterOutput {
  output_type: 'stream' | 'execute_result' | 'display_data' | 'error'
  name?: string
  text?: string | string[]
  data?: Record<string, string | string[]>
  execution_count?: number | null
  ename?: string
  evalue?: string
  traceback?: string[]
}

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
function joinText(text: string | string[] | undefined): string {
  if (!text) return ''
  if (typeof text === 'string') return text
  return text.join('')
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
    'python'
  return lang.toLowerCase()
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

      // Prefer image, then HTML, then plain text
      const pngData = data['image/png']
      if (pngData) {
        const raw = typeof pngData === 'string' ? pngData : pngData.join('')
        const artifactPath = `artifacts/output-${cellNum}-${outputIdx}.png`
        await writeFile(
          join(workspaceDir, artifactPath),
          Buffer.from(raw, 'base64')
        )
        result.imageData = artifactPath
      }

      const htmlData = data['text/html']
      if (htmlData) {
        result.html = typeof htmlData === 'string' ? htmlData : htmlData.join('')
      }

      const plainData = data['text/plain']
      if (plainData) {
        result.text = typeof plainData === 'string' ? plainData : plainData.join('')
      }

      // If nothing meaningful was extracted, skip
      if (!result.imageData && !result.html && !result.text) return null
      return result
    }

    case 'error': {
      return {
        outputType: 'error',
        text: output.evalue ?? 'Unknown error',
        traceback: output.traceback ?? []
      }
    }

    default:
      return null
  }
}

// ── Main import function ────────────────────────────────────────

/**
 * Import a Jupyter notebook (.ipynb) and convert it into a Lecta
 * notebook workspace at `workspaceDir`.
 */
export async function importIpynb(ipynbPath: string, workspaceDir: string): Promise<void> {
  // 1. Read and parse the notebook
  const raw = await readFile(ipynbPath, 'utf-8')
  let nb: JupyterNotebook
  try {
    nb = JSON.parse(raw) as JupyterNotebook
  } catch {
    throw new Error(`Failed to parse Jupyter notebook: ${ipynbPath}`)
  }

  if (!Array.isArray(nb.cells)) {
    throw new Error(`Invalid notebook: missing "cells" array in ${ipynbPath}`)
  }

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
  const title = extractTitle(nb.cells, basename(ipynbPath))

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

  for (let i = 0; i < nb.cells.length; i++) {
    const cell = nb.cells[i]
    const num = pad(i + 1)
    const cellId = `cell-${num}`
    const mdRelPath = `pages/${cellId}.md`
    const source = joinSource(cell.source)

    switch (cell.cell_type) {
      case 'markdown': {
        await writeFile(join(workspaceDir, mdRelPath), source, 'utf-8')
        pages.push({
          id: cellId,
          content: mdRelPath,
          cellType: 'markdown',
          cellIndex: i,
          createdAt: now,
          artifacts: []
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
            const converted = await convertOutput(cell.outputs[oi], num, oi, workspaceDir)
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

  // 6. Generate lecta.yaml
  // Map kernel language to a supported kernel value
  const kernelMap: Record<string, string> = {
    python: 'python', javascript: 'javascript', typescript: 'typescript',
    sql: 'sql', bash: 'bash', go: 'go', rust: 'rust'
  }
  const kernel = kernelMap[kernelLanguage] ?? 'python'

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
