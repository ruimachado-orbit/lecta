import type { ArtifactConfig, CodeBlockConfig, VideoConfig, WebAppConfig, SupportedLanguage } from './presentation'

export type NoteLayout = 'lines' | 'blank' | 'agenda' | 'grid' | 'jupyter'

export type CellType = 'markdown' | 'code' | 'raw'

export interface CellOutput {
  outputType: 'stream' | 'execute_result' | 'display_data' | 'error'
  text?: string
  html?: string
  imageData?: string // base64 PNG/JPEG or relative path to artifact
  traceback?: string[]
}

export interface NoteConfig {
  id: string
  content: string // relative path to .md file
  layout?: NoteLayout
  createdAt: string // ISO 8601
  archivedAt?: string // ISO 8601 — if set, note is archived
  artifacts: ArtifactConfig[]
  code?: CodeBlockConfig
  video?: VideoConfig
  webapp?: WebAppConfig
  children?: NoteConfig[] // subnotes (recursive tree)
  cellType?: CellType // Jupyter cell type origin
  cellIndex?: number // Original cell position in .ipynb
  outputs?: CellOutput[] // Preserved/live cell outputs
}

export type NotebookKernel = 'python' | 'javascript' | 'typescript' | 'sql' | 'bash' | 'go' | 'rust'

export interface Notebook {
  type: 'notebook'
  title: string
  author: string
  theme: string
  defaultLayout: NoteLayout
  lastViewedIndex?: number
  pages: NoteConfig[]
  rootPath: string
  sourceFormat?: 'native' | 'jupyter'
  kernel?: NotebookKernel
}

export interface LoadedNote {
  config: NoteConfig
  markdownContent: string
  codeContent: string | null
  codeLanguage: SupportedLanguage | null
  children: LoadedNote[]
  depth: number // 0=top-level, 1=child, etc.
}

export interface LoadedNotebook {
  config: Notebook
  pages: LoadedNote[] // flat DFS order with depth for easy indexing
}
