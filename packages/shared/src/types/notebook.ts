import type { ArtifactConfig, CodeBlockConfig, VideoConfig, WebAppConfig, SupportedLanguage } from './presentation'

export type NoteLayout = 'lines' | 'blank' | 'agenda' | 'grid'

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
}

export interface Notebook {
  type: 'notebook'
  title: string
  author: string
  theme: string
  defaultLayout: NoteLayout
  pages: NoteConfig[]
  rootPath: string
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
