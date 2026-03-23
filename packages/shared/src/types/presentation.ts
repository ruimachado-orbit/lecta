export interface SlideGroupConfig {
  id: string
  name: string
  slideIds: string[]
  color?: string
}

export interface Presentation {
  title: string
  author: string
  theme: string
  lastViewedIndex?: number
  slides: SlideConfig[]
  rootPath: string
  ai?: AIConfig
  groups?: SlideGroupConfig[]
  presenterNotes?: string
}

export interface VideoConfig {
  url: string
  label?: string
}

export interface WebAppConfig {
  url: string
  label?: string
}

export interface PromptConfig {
  prompt: string
  label?: string
  response?: string
}

export type SlideTransition = 'none' | 'left' | 'right' | 'top' | 'bottom'

export type SlideLayout =
  | 'default'          // Standard top-down flow
  | 'center'           // Everything centered vertically + horizontally
  | 'title'            // Big centered title with subtitle below
  | 'section'          // Section break — bold heading, accent bar
  | 'two-col'          // Two equal columns
  | 'two-col-wide-left'  // 60/40 left-heavy columns
  | 'two-col-wide-right' // 40/60 right-heavy columns
  | 'three-col'        // Three equal columns
  | 'top-bottom'       // Content split top and bottom
  | 'big-number'       // Large stat/number with context below
  | 'quote'            // Blockquote-style centered quote
  | 'blank'            // No padding, full canvas

export interface SlideConfig {
  id: string
  title?: string
  content: string
  code?: CodeBlockConfig
  video?: VideoConfig
  webapp?: WebAppConfig
  prompts: PromptConfig[]
  artifacts: ArtifactConfig[]
  notes?: string
  transition?: SlideTransition
  layout?: SlideLayout
  drawings?: string // JSON string of Excalidraw elements
  skipped?: boolean
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
  isMdx?: boolean
}

export interface LoadedPresentation {
  config: Presentation
  slides: LoadedSlide[]
}
