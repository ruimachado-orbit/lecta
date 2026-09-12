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

/**
 * Optional per-slide backdrop, painted behind the slide content. Any combination of the
 * three layers may be set; they stack colour → gradient → image, with `overlay` (0-100)
 * darkening whatever is beneath it so light text and translucent "glass" elements stay
 * legible.
 */
export interface SlideBackground {
  /** Any CSS colour. */
  color?: string
  /** Any CSS `background-image` value — the built-in presets are linear-gradients. */
  gradient?: string
  /** Deck-relative image path, e.g. `images/hero.png`. */
  image?: string
  /** Darkening scrim over the layers below, 0-100. */
  overlay?: number
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
  background?: SlideBackground
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
