import type {
  ExecutionEngine,
  SlideLayout,
  SlideTransition,
  SupportedLanguage,
} from '../slide-options'

export type { ExecutionEngine, SlideLayout, SlideTheme, SlideTransition, SupportedLanguage } from '../slide-options'

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
