export interface SlideGroupConfig {
  id: string
  name: string
  slideIds: string[]
}

export interface Presentation {
  title: string
  author: string
  theme: string
  slides: SlideConfig[]
  rootPath: string
  ai?: AIConfig
  groups?: SlideGroupConfig[]
}

export interface VideoConfig {
  url: string
  label?: string
}

export interface WebAppConfig {
  url: string
  label?: string
}

export type SlideTransition = 'none' | 'left' | 'right' | 'top' | 'bottom'

export interface SlideConfig {
  id: string
  content: string
  code?: CodeBlockConfig
  video?: VideoConfig
  webapp?: WebAppConfig
  artifacts: ArtifactConfig[]
  notes?: string
  transition?: SlideTransition
}

export interface CodeBlockConfig {
  file: string
  language: SupportedLanguage
  execution: ExecutionEngine
  dependencies?: string[]
  packages?: string[]
  seedData?: string
  command?: string
  args?: string[]
}

export interface ArtifactConfig {
  path: string
  label: string
}

export interface AIConfig {
  model?: string
  autoGenerateNotes?: boolean
  context?: 'slide' | 'code' | 'slide+code'
}

export type SupportedLanguage =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'sql'
  | 'html'
  | 'css'
  | 'json'
  | 'bash'
  | 'rust'
  | 'go'
  | 'java'
  | 'csharp'
  | 'ruby'
  | 'php'
  | 'markdown'

export type ExecutionEngine = 'sandpack' | 'pyodide' | 'sql' | 'native' | 'none'

export interface LoadedSlide {
  config: SlideConfig
  markdownContent: string
  codeContent: string | null
  codeLanguage: SupportedLanguage | null
  notesContent: string | null
}

export interface LoadedPresentation {
  config: Presentation
  slides: LoadedSlide[]
}
