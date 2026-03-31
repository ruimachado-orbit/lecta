/**
 * Core I/O layer for reading/writing Lecta presentations on disk.
 * Extracted from the Electron IPC handlers so it works headless.
 */

import { readFile, writeFile, mkdir, access, copyFile, rename, stat as fsStat } from 'fs/promises'
import { join, basename, extname } from 'path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { z } from 'zod'

// ── Types (mirrored from packages/shared to avoid import issues with NodeNext) ──

export type SlideLayout =
  | 'default' | 'center' | 'title' | 'section'
  | 'two-col' | 'two-col-wide-left' | 'two-col-wide-right'
  | 'three-col' | 'top-bottom' | 'big-number' | 'quote' | 'blank'

export type SlideTransition = 'none' | 'left' | 'right' | 'top' | 'bottom'

export type SupportedLanguage =
  | 'javascript' | 'typescript' | 'python' | 'sql' | 'html' | 'css'
  | 'json' | 'bash' | 'rust' | 'go' | 'java' | 'csharp' | 'ruby' | 'php' | 'markdown'

export type ExecutionEngine = 'sandpack' | 'pyodide' | 'sql' | 'native' | 'none'

export interface ArtifactConfig {
  path: string
  label: string
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
  drawings?: string
  skipped?: boolean
}

export interface SlideGroupConfig {
  id: string
  name: string
  slideIds: string[]
  color?: string
}

export interface AIConfig {
  model?: string
  autoGenerateNotes?: boolean
  context?: 'slide' | 'code' | 'slide+code'
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

// ── Constants ──

export const DECK_CONFIG_FILE = 'lecta.yaml'

/** Default directory for new presentations — ~/Documents/Lecta */
export function getDefaultPresentationsPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp'
  return join(home, 'Documents', 'Lecta')
}

/** Generate a kebab-case slug from text */
export function toSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const VALID_THEMES = ['dark', 'light', 'executive', 'minimal', 'corporate', 'creative', 'keynote-dark', 'paper']

const VALID_LAYOUTS: SlideLayout[] = [
  'default', 'center', 'title', 'section', 'two-col', 'two-col-wide-left',
  'two-col-wide-right', 'three-col', 'top-bottom', 'big-number', 'quote', 'blank'
]

const LANGUAGE_TO_ENGINE: Partial<Record<SupportedLanguage, ExecutionEngine>> = {
  javascript: 'sandpack',
  typescript: 'sandpack',
  python: 'pyodide',
  sql: 'sql'
}

const LANGUAGE_TO_EXT: Partial<Record<SupportedLanguage, string>> = {
  javascript: '.js', typescript: '.ts', python: '.py', sql: '.sql',
  html: '.html', css: '.css', json: '.json', bash: '.sh',
  rust: '.rs', go: '.go', java: '.java', csharp: '.cs', ruby: '.rb', php: '.php',
  markdown: '.md'
}

const NATIVE_COMMAND_MAP: Partial<Record<SupportedLanguage, string>> = {
  javascript: 'node', bash: 'bash', python: 'python3',
  rust: 'rustc', go: 'go', ruby: 'ruby', php: 'php'
}

// ── Zod Schema (mirrors packages/shared/src/utils/yaml-parser.ts) ──

const ArtifactConfigSchema = z.object({ path: z.string(), label: z.string() })

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

const PresentationSchema = z.object({
  title: z.string(),
  author: z.string(),
  theme: z.string().default('dark'),
  lastViewedIndex: z.number().optional(),
  slides: z.array(z.object({
    id: z.string(),
    title: z.string().optional(),
    content: z.string(),
    code: CodeBlockConfigSchema.optional(),
    video: z.object({ url: z.string(), label: z.string().optional() }).optional(),
    webapp: z.object({ url: z.string(), label: z.string().optional() }).optional(),
    prompts: z.array(z.object({ prompt: z.string(), label: z.string().optional(), response: z.string().optional() })).default([]),
    artifacts: z.array(ArtifactConfigSchema).default([]),
    notes: z.string().optional(),
    transition: z.enum(['none', 'left', 'right', 'top', 'bottom']).optional(),
    layout: z.enum([
      'default', 'center', 'title', 'section', 'two-col', 'two-col-wide-left',
      'two-col-wide-right', 'three-col', 'top-bottom', 'big-number', 'quote', 'blank'
    ]).optional(),
    drawings: z.string().optional(),
    skipped: z.boolean().optional()
  })),
  ai: z.object({
    model: z.string().optional(),
    autoGenerateNotes: z.boolean().optional(),
    context: z.enum(['slide', 'code', 'slide+code']).optional()
  }).optional(),
  groups: z.array(z.object({
    id: z.string(),
    name: z.string(),
    slideIds: z.array(z.string()),
    color: z.string().optional()
  })).optional(),
  presenterNotes: z.string().optional()
})

// ── Parse & Serialize ──

export function parsePresentationYaml(yamlContent: string, rootPath: string): Presentation {
  const raw = parseYaml(yamlContent)
  const parsed = PresentationSchema.parse(raw)
  return { ...parsed, rootPath, slides: parsed.slides as SlideConfig[] }
}

export function serializePresentationYaml(presentation: Presentation): string {
  const toSerialize: Record<string, unknown> = {
    title: presentation.title,
    author: presentation.author,
    theme: presentation.theme,
    ...(presentation.lastViewedIndex != null && presentation.lastViewedIndex > 0
      ? { lastViewedIndex: presentation.lastViewedIndex } : {}),
    slides: presentation.slides.map((s) => {
      const slide: Record<string, unknown> = { id: s.id, ...(s.title ? { title: s.title } : {}), content: s.content }
      if (s.code) slide.code = s.code
      if (s.video) slide.video = s.video
      if (s.webapp) slide.webapp = s.webapp
      if (s.prompts && s.prompts.length > 0) slide.prompts = s.prompts
      slide.artifacts = s.artifacts
      if (s.notes) slide.notes = s.notes
      if (s.transition && s.transition !== 'none') slide.transition = s.transition
      if (s.layout && s.layout !== 'default') slide.layout = s.layout
      if (s.drawings) slide.drawings = s.drawings
      if (s.skipped) slide.skipped = true
      return slide
    })
  }
  if (presentation.ai) toSerialize.ai = presentation.ai
  if (presentation.presenterNotes) toSerialize.presenterNotes = presentation.presenterNotes
  if (presentation.groups && presentation.groups.length > 0) {
    toSerialize.groups = presentation.groups.map((g) => {
      const group: Record<string, unknown> = { id: g.id, name: g.name, slideIds: g.slideIds }
      if (g.color) group.color = g.color
      return group
    })
  }
  if ((presentation as any).customStyles) {
    toSerialize.customStyles = (presentation as any).customStyles
  }
  return stringifyYaml(toSerialize, { lineWidth: 120 })
}

// ── Config Cache ──

const configCache = new Map<string, { config: Presentation; mtimeMs: number }>()

/**
 * Load only the YAML config (no slide content). Uses mtime-based cache.
 */
export async function loadPresentationConfig(rootPath: string): Promise<Presentation> {
  const configPath = join(rootPath, DECK_CONFIG_FILE)
  const st = await fsStat(configPath)
  const cached = configCache.get(rootPath)
  if (cached && cached.mtimeMs === st.mtimeMs) {
    // Return a deep-enough copy so callers can mutate slides array safely
    return { ...cached.config, slides: cached.config.slides.map(s => ({ ...s })) }
  }
  const yamlContent = await readFile(configPath, 'utf-8')
  const config = parsePresentationYaml(yamlContent, rootPath)
  configCache.set(rootPath, { config, mtimeMs: st.mtimeMs })
  return { ...config, slides: config.slides.map(s => ({ ...s })) }
}

// ── Core I/O Functions ──

export async function loadPresentation(rootPath: string): Promise<LoadedPresentation> {
  const configPath = join(rootPath, DECK_CONFIG_FILE)
  await access(configPath)
  const yamlContent = await readFile(configPath, 'utf-8')
  const config = parsePresentationYaml(yamlContent, rootPath)

  const slides: LoadedSlide[] = await Promise.all(
    config.slides.map(async (slideConfig) => {
      const markdownPath = join(rootPath, slideConfig.content)
      let markdownContent: string
      try {
        markdownContent = await readFile(markdownPath, 'utf-8')
      } catch {
        markdownContent = `# ${slideConfig.id}`
      }

      let codeContent: string | null = null
      if (slideConfig.code) {
        try {
          codeContent = await readFile(join(rootPath, slideConfig.code.file), 'utf-8')
        } catch {
          codeContent = ''
        }
      }

      let notesContent: string | null = null
      if (slideConfig.notes) {
        try {
          notesContent = await readFile(join(rootPath, slideConfig.notes), 'utf-8')
        } catch {
          notesContent = null
        }
      }

      return {
        config: slideConfig,
        markdownContent,
        codeContent,
        codeLanguage: slideConfig.code?.language ?? null,
        notesContent,
        isMdx: slideConfig.content.endsWith('.mdx')
      }
    })
  )

  return { config, slides }
}

export async function savePresentationYaml(presentation: Presentation): Promise<void> {
  const configPath = join(presentation.rootPath, DECK_CONFIG_FILE)
  await writeFile(configPath, serializePresentationYaml(presentation), 'utf-8')
  // Update cache with fresh mtime
  const st = await fsStat(configPath)
  configCache.set(presentation.rootPath, { config: presentation, mtimeMs: st.mtimeMs })
}

export async function createPresentation(opts: {
  path?: string
  title: string
  theme?: string
  author?: string
  slideCount?: number
  slideTitles?: string[]
  format?: 'md' | 'mdx'
}): Promise<{ rootPath: string; slideCount: number }> {
  const theme = opts.theme && VALID_THEMES.includes(opts.theme) ? opts.theme : 'dark'
  const author = opts.author ?? ''
  const slideCount = Math.max(1, Math.min(opts.slideCount ?? 1, 50))

  const basePath = opts.path || getDefaultPresentationsPath()
  const slug = toSlug(opts.title)
  const projectDir = join(basePath, slug)

  // Create the full directory tree — if the parent path doesn't exist or isn't writable, fail with a clear message
  try {
    await mkdir(join(projectDir, 'slides'), { recursive: true })
    await mkdir(join(projectDir, 'code'), { recursive: true })
    await mkdir(join(projectDir, 'artifacts'), { recursive: true })
  } catch (err: any) {
    if (err.code === 'ENOENT' || err.code === 'EACCES' || err.code === 'EPERM') {
      throw new Error(
        `Cannot create presentation at "${opts.path}": directory does not exist or is not writable. ` +
        `Try using a path inside the user's home directory (e.g., ~/Documents or ~/Desktop).`
      )
    }
    throw err
  }

  const slides: SlideConfig[] = []
  for (let i = 0; i < slideCount; i++) {
    const num = String(i + 1).padStart(2, '0')
    const title = opts.slideTitles?.[i] ?? (i === 0 ? opts.title : `Slide ${i + 1}`)
    const slideId = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const slideExt = opts.format === 'md' ? '.md' : '.mdx'
    const contentPath = `slides/${num}-${slideId}${slideExt}`

    const layout: SlideLayout | undefined = i === 0 ? 'title' : undefined
    const isMdx = opts.format !== 'md'
    let markdown: string
    if (isMdx) {
      if (i === 0) {
        markdown = `<div style={{width:'100%',height:'100%',background:'linear-gradient(135deg,#0a0e1a,#0f1729)',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',textAlign:'center',padding:'60px 80px'}}>
  <div style={{fontSize:'56px',fontWeight:800,color:'#fff',marginBottom:'24px'}}>${opts.title}</div>
  <div style={{fontSize:'24px',color:'#94a3b8'}}>${author || 'Welcome to your new presentation!'}</div>
</div>\n`
      } else {
        markdown = `<div style={{width:'100%',height:'100%',background:'linear-gradient(135deg,#0a0e1a,#0f1729)',padding:'60px 80px',position:'relative',overflow:'hidden'}}>
  <div style={{fontSize:'44px',fontWeight:800,color:'#fff',marginBottom:'40px'}}>${title}</div>
</div>\n`
      }
    } else {
      markdown = i === 0
        ? `# ${opts.title}\n\n${author ? `**${author}**` : 'Welcome to your new presentation!'}\n`
        : `# ${title}\n\n`
    }

    await writeFile(join(projectDir, contentPath), markdown, 'utf-8')

    slides.push({
      id: slideId,
      title,
      content: contentPath,
      prompts: [],
      artifacts: [],
      ...(layout ? { layout } : {})
    })
  }

  const presentation: Presentation = {
    title: opts.title,
    author,
    theme,
    slides,
    rootPath: projectDir
  }

  await savePresentationYaml(presentation)

  // Register in Lecta's recent decks so it shows on the home screen
  const firstSlideContent = slides[0]
    ? await readFile(join(projectDir, slides[0].content), 'utf-8').catch(() => `# ${opts.title}`)
    : `# ${opts.title}`
  const isMdx = slides[0]?.content.endsWith('.mdx') ?? false
  await registerInRecentDecks(projectDir, opts.title, slideCount, firstSlideContent, { isMdx, theme }).catch(() => {})

  return { rootPath: projectDir, slideCount }
}

export async function addSlide(opts: {
  rootPath: string
  slideId?: string
  title?: string
  content: string
  afterIndex?: number
  layout?: SlideLayout
  code?: { content: string; language: SupportedLanguage; execution?: ExecutionEngine }
  notes?: string
  format?: 'md' | 'mdx'
}): Promise<{ slideIndex: number; slideCount: number }> {
  const config = await loadPresentationConfig(opts.rootPath)
  const insertAt = opts.afterIndex != null ? opts.afterIndex + 1 : config.slides.length

  // Auto-generate slideId from the first heading in content, or fall back to slide number
  const headingMatch = opts.content.match(/^#\s+(.+)$/m)?.[1]
  const autoId = opts.slideId
    || toSlug(headingMatch || `slide-${config.slides.length + 1}`)
  const slideTitle = opts.title || headingMatch || autoId.replace(/-/g, ' ')
  const slideNum = String(config.slides.length + 1).padStart(2, '0')
  const ext = opts.format === 'md' ? '.md' : '.mdx'
  const contentPath = `slides/${slideNum}-${autoId}${ext}`

  await mkdir(join(opts.rootPath, 'slides'), { recursive: true })
  await writeFile(join(opts.rootPath, contentPath), opts.content, 'utf-8')

  const newSlide: SlideConfig = {
    id: autoId,
    title: slideTitle,
    content: contentPath,
    prompts: [],
    artifacts: [],
    ...(opts.layout && opts.layout !== 'default' ? { layout: opts.layout } : {})
  }

  // Handle code block
  if (opts.code) {
    const ext = LANGUAGE_TO_EXT[opts.code.language] || '.txt'
    const codeFile = `code/${opts.slideId}${ext}`
    await mkdir(join(opts.rootPath, 'code'), { recursive: true })
    await writeFile(join(opts.rootPath, codeFile), opts.code.content, 'utf-8')

    const engine = opts.code.execution ?? LANGUAGE_TO_ENGINE[opts.code.language] ?? 'native'
    newSlide.code = { file: codeFile, language: opts.code.language, execution: engine }

    if (engine === 'native') {
      const cmd = NATIVE_COMMAND_MAP[opts.code.language]
      if (cmd) {
        newSlide.code.command = cmd
        newSlide.code.args = [codeFile]
      }
    }
  }

  // Handle notes
  if (opts.notes) {
    const notesPath = `slides/${autoId}.notes.md`
    await writeFile(join(opts.rootPath, notesPath), opts.notes, 'utf-8')
    newSlide.notes = notesPath
  }

  config.slides.splice(insertAt, 0, newSlide)
  await savePresentationYaml(config)

  return { slideIndex: insertAt, slideCount: config.slides.length }
}

export async function editSlide(opts: {
  rootPath: string
  slideIndex: number
  title?: string
  content?: string
  layout?: SlideLayout
  codeContent?: string
  codeLanguage?: SupportedLanguage
  notes?: string
  transition?: SlideTransition
  format?: 'md' | 'mdx'
}): Promise<{ slideId: string }> {
  const config = await loadPresentationConfig(opts.rootPath)
  const slide = config.slides[opts.slideIndex]
  if (!slide) throw new Error(`Slide at index ${opts.slideIndex} not found`)

  if (opts.title !== undefined) {
    slide.title = opts.title
  }

  // Convert format (rename file extension) if requested
  if (opts.format) {
    const currentExt = slide.content.endsWith('.mdx') ? '.mdx' : '.md'
    const targetExt = opts.format === 'mdx' ? '.mdx' : '.md'
    if (currentExt !== targetExt) {
      const oldPath = join(opts.rootPath, slide.content)
      const newContentPath = slide.content.replace(/\.(mdx?|md)$/, targetExt)
      await rename(oldPath, join(opts.rootPath, newContentPath))
      slide.content = newContentPath
    }
  }

  if (opts.content !== undefined) {
    await writeFile(join(opts.rootPath, slide.content), opts.content, 'utf-8')
  }

  if (opts.layout !== undefined) {
    if (opts.layout === 'default') {
      delete (slide as any).layout
    } else {
      slide.layout = opts.layout
    }
  }

  if (opts.transition !== undefined) {
    slide.transition = opts.transition
  }

  if (opts.codeContent !== undefined && slide.code) {
    await writeFile(join(opts.rootPath, slide.code.file), opts.codeContent, 'utf-8')
  }

  if (opts.codeLanguage !== undefined && slide.code) {
    slide.code.language = opts.codeLanguage
    slide.code.execution = LANGUAGE_TO_ENGINE[opts.codeLanguage] ?? 'native'
  }

  if (opts.notes !== undefined) {
    if (!slide.notes) {
      const notesPath = `slides/${slide.id}.notes.md`
      slide.notes = notesPath
    }
    await mkdir(join(opts.rootPath, 'slides'), { recursive: true })
    await writeFile(join(opts.rootPath, slide.notes), opts.notes, 'utf-8')
  }

  await savePresentationYaml(config)
  return { slideId: slide.id }
}

export async function deleteSlide(rootPath: string, slideIndex: number): Promise<{ deletedId: string; slideCount: number }> {
  const config = await loadPresentationConfig(rootPath)
  if (config.slides.length <= 1) throw new Error('Cannot delete the last slide')
  const deleted = config.slides[slideIndex]
  if (!deleted) throw new Error(`Slide at index ${slideIndex} not found`)

  config.slides.splice(slideIndex, 1)
  await savePresentationYaml(config)
  return { deletedId: deleted.id, slideCount: config.slides.length }
}

export async function listSlides(rootPath: string, includeContent: boolean = false): Promise<{
  title: string
  author: string
  theme: string
  slideCount: number
  slides: Array<{
    index: number
    id: string
    layout?: string
    transition?: string
    heading?: string
    codeLanguage?: string
    artifactCount: number
    content?: string
    codeContent?: string
    notes?: string
  }>
}> {
  if (includeContent) {
    // Full load — reads all slide files (only when content is requested)
    const loaded = await loadPresentation(rootPath)
    const { config, slides } = loaded
    return {
      title: config.title,
      author: config.author,
      theme: config.theme,
      slideCount: slides.length,
      slides: slides.map((s, i) => {
        const headingMatch = s.markdownContent.match(/^#\s+(.+)$/m)
        const entry: any = {
          index: i,
          id: s.config.id,
          title: s.config.title,
          format: s.config.content.endsWith('.mdx') ? 'mdx' : 'md',
          heading: s.config.title || headingMatch?.[1] || s.config.id,
          artifactCount: s.config.artifacts.length
        }
        if (s.config.layout && s.config.layout !== 'default') entry.layout = s.config.layout
        if (s.config.transition && s.config.transition !== 'none') entry.transition = s.config.transition
        if (s.codeLanguage) entry.codeLanguage = s.codeLanguage
        entry.content = s.markdownContent
        if (s.codeContent) entry.codeContent = s.codeContent
        if (s.notesContent) entry.notes = s.notesContent
        return entry
      })
    }
  }

  // Config-only load — no slide file reads
  const config = await loadPresentationConfig(rootPath)
  return {
    title: config.title,
    author: config.author,
    theme: config.theme,
    slideCount: config.slides.length,
    slides: config.slides.map((s, i) => {
      const entry: any = {
        index: i,
        id: s.id,
        title: s.title,
        format: s.content.endsWith('.mdx') ? 'mdx' : 'md',
        heading: s.title || s.id.replace(/-/g, ' '),
        artifactCount: s.artifacts.length
      }
      if (s.layout && s.layout !== 'default') entry.layout = s.layout
      if (s.transition && s.transition !== 'none') entry.transition = s.transition
      if (s.code?.language) entry.codeLanguage = s.code.language
      return entry
    })
  }
}

export async function setTheme(rootPath: string, theme: string): Promise<{ oldTheme: string; newTheme: string }> {
  if (!VALID_THEMES.includes(theme)) {
    throw new Error(`Invalid theme "${theme}". Valid themes: ${VALID_THEMES.join(', ')}`)
  }
  const config = await loadPresentationConfig(rootPath)
  const oldTheme = config.theme
  config.theme = theme
  await savePresentationYaml(config)
  return { oldTheme, newTheme: theme }
}

export async function addArtifact(opts: {
  rootPath: string
  slideIndex: number
  filePath: string
  label?: string
}): Promise<{ artifactPath: string; label: string }> {
  // Reject image files — they should use addImage instead
  const fileExt = extname(opts.filePath).toLowerCase()
  const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp']
  if (IMAGE_EXTENSIONS.includes(fileExt)) {
    throw new Error(`Image files should not be added as artifacts. Use the add_image tool instead to embed "${basename(opts.filePath)}" directly into the slide content.`)
  }

  const config = await loadPresentationConfig(opts.rootPath)
  const slide = config.slides[opts.slideIndex]
  if (!slide) throw new Error(`Slide at index ${opts.slideIndex} not found`)

  await mkdir(join(opts.rootPath, 'artifacts'), { recursive: true })

  const fileName = basename(opts.filePath)
  const destPath = join(opts.rootPath, 'artifacts', fileName)
  await copyFile(opts.filePath, destPath)

  const label = opts.label ?? fileName.replace(extname(fileName), '')
  slide.artifacts.push({ path: `artifacts/${fileName}`, label })

  await savePresentationYaml(config)
  return { artifactPath: `artifacts/${fileName}`, label }
}

const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp']

export async function addImage(opts: {
  rootPath: string
  filePath: string
  slideIndex?: number
  position?: { x: number; y: number; w: number }
  altText?: string
}): Promise<{ imagePath: string; inserted: boolean }> {
  const ext = extname(opts.filePath).toLowerCase()
  if (!SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported image format "${ext}". Supported: ${SUPPORTED_IMAGE_EXTENSIONS.join(', ')}`)
  }

  await access(opts.filePath)

  const imagesDir = join(opts.rootPath, 'images')
  await mkdir(imagesDir, { recursive: true })

  const destName = `${Date.now()}-${basename(opts.filePath)}`
  await copyFile(opts.filePath, join(imagesDir, destName))

  const imagePath = `images/${destName}`
  let inserted = false

  if (opts.slideIndex != null) {
    const config = await loadPresentationConfig(opts.rootPath)
    const slide = config.slides[opts.slideIndex]
    if (!slide) throw new Error(`Slide at index ${opts.slideIndex} not found`)

    const slidePath = join(opts.rootPath, slide.content)
    let content = await readFile(slidePath, 'utf-8')

    const isMdx = slide.content.endsWith('.mdx')
    if (opts.position) {
      content += `\n<!-- image x=${opts.position.x} y=${opts.position.y} w=${opts.position.w} src=${imagePath} -->\n`
    } else if (isMdx) {
      const alt = opts.altText || basename(opts.filePath, ext)
      const imgTag = `  <img src="${imagePath}" alt="${alt}" style={{maxWidth:'100%',borderRadius:'8px'}} />`
      // Insert before the last closing </div> so the image stays inside the root container
      const lastClosingDiv = content.lastIndexOf('</div>')
      if (lastClosingDiv !== -1) {
        content = content.slice(0, lastClosingDiv) + imgTag + '\n' + content.slice(lastClosingDiv)
      } else {
        content += `\n${imgTag}\n`
      }
    } else {
      const alt = opts.altText || basename(opts.filePath, ext)
      content += `\n![${alt}](${imagePath})\n`
    }

    await writeFile(slidePath, content, 'utf-8')
    inserted = true
  }

  return { imagePath, inserted }
}

// ── Theme Customization ──

export async function customizeTheme(opts: {
  rootPath: string
  accentColor?: string
  bgColor?: string
  textColor?: string
  headingFont?: string
  bodyFont?: string
}): Promise<{ success: boolean; customStyles: Record<string, string> }> {
  const config = await loadPresentationConfig(opts.rootPath)

  const customStyles: Record<string, string> = {}
  if (opts.accentColor) customStyles.accentColor = opts.accentColor
  if (opts.bgColor) customStyles.bgColor = opts.bgColor
  if (opts.textColor) customStyles.textColor = opts.textColor
  if (opts.headingFont) customStyles.headingFont = opts.headingFont
  if (opts.bodyFont) customStyles.bodyFont = opts.bodyFont

  const existing = (config as any).customStyles || {}
  const merged = { ...existing, ...customStyles }

  ;(config as any).customStyles = merged
  await savePresentationYaml(config)

  return { success: true, customStyles: merged }
}

// ── Lecta App Integration ──

/**
 * Get the Lecta app's settings.json path (same as Electron's app.getPath('userData'))
 */
function getLectaSettingsPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Lecta', 'settings.json')
  }
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Lecta', 'settings.json')
  }
  // Linux
  return join(home, '.config', 'Lecta', 'settings.json')
}

/**
 * Register a presentation in Lecta's recent decks so it shows on the home screen.
 */
export async function registerInRecentDecks(rootPath: string, title: string, slideCount: number, firstSlideContent: string, opts?: { isMdx?: boolean; theme?: string }): Promise<void> {
  const settingsPath = getLectaSettingsPath()

  let settings: Record<string, any> = {}
  try {
    const content = await readFile(settingsPath, 'utf-8')
    settings = JSON.parse(content)
  } catch {
    // Settings file might not exist yet
  }

  const recentDecks: any[] = Array.isArray(settings.recentDecks) ? settings.recentDecks : []

  // Build preview from first slide content
  const preview = firstSlideContent
    .replace(/<!--.*?-->/gs, '')
    .trim()
    .split('\n')
    .filter((l: string) => l.trim())
    .slice(0, 5)
    .join('\n')
    .slice(0, 200)

  const entry = {
    path: rootPath,
    title,
    date: new Date().toISOString(),
    type: 'presentation' as const,
    slideCount,
    firstSlidePreview: preview,
    firstSlideContent,
    firstSlideIsMdx: opts?.isMdx ?? false,
    theme: opts?.theme ?? 'dark',
    artifacts: []
  }

  // Add to front, remove duplicates, cap at 20
  settings.recentDecks = [entry, ...recentDecks.filter((d: any) => d.path !== rootPath)].slice(0, 20)

  // Ensure directory exists
  await mkdir(join(settingsPath, '..'), { recursive: true })
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}

// ── Design System (shared across all presentations) ──

export interface DesignElement {
  id: string
  name: string
  category: 'component' | 'color-palette' | 'typography' | 'snippet' | 'layout-pattern'
  description: string
  content: string  // JSX snippet, CSS values, or markdown
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface DesignSystem {
  version: number
  elements: DesignElement[]
}

function getDesignSystemPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  const base = process.platform === 'darwin'
    ? join(home, 'Library', 'Application Support', 'Lecta')
    : process.platform === 'win32'
      ? join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Lecta')
      : join(home, '.config', 'Lecta')
  return join(base, 'design-system.json')
}

export async function loadDesignSystem(): Promise<DesignSystem> {
  try {
    const content = await readFile(getDesignSystemPath(), 'utf-8')
    return JSON.parse(content)
  } catch {
    return { version: 1, elements: [] }
  }
}

async function saveDesignSystem(ds: DesignSystem): Promise<void> {
  const dsPath = getDesignSystemPath()
  await mkdir(join(dsPath, '..'), { recursive: true })
  await writeFile(dsPath, JSON.stringify(ds, null, 2), 'utf-8')
}

export async function listDesignElements(opts?: {
  category?: string
  tags?: string[]
  search?: string
}): Promise<DesignElement[]> {
  const ds = await loadDesignSystem()
  let elements = ds.elements

  if (opts?.category) {
    elements = elements.filter(e => e.category === opts.category)
  }
  if (opts?.tags && opts.tags.length > 0) {
    elements = elements.filter(e => opts.tags!.some(t => e.tags.includes(t)))
  }
  if (opts?.search) {
    const q = opts.search.toLowerCase()
    elements = elements.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.tags.some(t => t.toLowerCase().includes(q))
    )
  }

  return elements
}

export async function getDesignElement(id: string): Promise<DesignElement | null> {
  const ds = await loadDesignSystem()
  return ds.elements.find(e => e.id === id) || null
}

export async function saveDesignElement(element: Omit<DesignElement, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<DesignElement> {
  const ds = await loadDesignSystem()
  const now = new Date().toISOString()

  if (element.id) {
    // Update existing
    const idx = ds.elements.findIndex(e => e.id === element.id)
    if (idx !== -1) {
      ds.elements[idx] = { ...ds.elements[idx], ...element, id: element.id, updatedAt: now }
      await saveDesignSystem(ds)
      return ds.elements[idx]
    }
  }

  // Create new
  const newElement: DesignElement = {
    id: `ds-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: element.name,
    category: element.category,
    description: element.description,
    content: element.content,
    tags: element.tags,
    createdAt: now,
    updatedAt: now,
  }
  ds.elements.unshift(newElement)
  await saveDesignSystem(ds)
  return newElement
}

export async function deleteDesignElement(id: string): Promise<boolean> {
  const ds = await loadDesignSystem()
  const before = ds.elements.length
  ds.elements = ds.elements.filter(e => e.id !== id)
  if (ds.elements.length < before) {
    await saveDesignSystem(ds)
    return true
  }
  return false
}

// ── Slide Library (headless access — reads the Electron slide-library.json) ──

export interface StoredSlide {
  id: string
  name: string
  markdown: string
  layout?: string
  codeContent?: string
  codeLanguage?: string
  savedAt: string
  tags?: string[]
}

function getSlideLibraryPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  const base = process.platform === 'darwin'
    ? join(home, 'Library', 'Application Support', 'Lecta')
    : process.platform === 'win32'
      ? join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Lecta')
      : join(home, '.config', 'Lecta')
  return join(base, 'slide-library.json')
}

export async function listSlideLibrary(opts?: {
  tags?: string[]
  search?: string
}): Promise<StoredSlide[]> {
  let slides: StoredSlide[]
  try {
    const content = await readFile(getSlideLibraryPath(), 'utf-8')
    slides = JSON.parse(content)
  } catch {
    slides = []
  }

  if (opts?.tags && opts.tags.length > 0) {
    slides = slides.filter(s => opts.tags!.some(t => (s.tags || []).includes(t)))
  }
  if (opts?.search) {
    const q = opts.search.toLowerCase()
    slides = slides.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.markdown.toLowerCase().includes(q) ||
      (s.tags || []).some(t => t.toLowerCase().includes(q))
    )
  }

  return slides
}

export async function getSlideFromLibrary(id: string): Promise<StoredSlide | null> {
  const slides = await listSlideLibrary()
  return slides.find(s => s.id === id) || null
}

export async function saveSlideToLibrary(slide: {
  name: string
  markdown: string
  layout?: string
  codeContent?: string
  codeLanguage?: string
  tags?: string[]
}): Promise<StoredSlide> {
  let slides: StoredSlide[]
  try {
    const content = await readFile(getSlideLibraryPath(), 'utf-8')
    slides = JSON.parse(content)
  } catch {
    slides = []
  }

  const stored: StoredSlide = {
    id: `slide-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: slide.name,
    markdown: slide.markdown,
    layout: slide.layout,
    codeContent: slide.codeContent,
    codeLanguage: slide.codeLanguage,
    savedAt: new Date().toISOString(),
    tags: slide.tags,
  }

  slides.unshift(stored)
  const libPath = getSlideLibraryPath()
  await mkdir(join(libPath, '..'), { recursive: true })
  await writeFile(libPath, JSON.stringify(slides, null, 2), 'utf-8')

  return stored
}

export async function insertLibrarySlide(opts: {
  rootPath: string
  slideId: string
  afterIndex?: number
  format?: 'md' | 'mdx'
}): Promise<{ slideIndex: number; slideCount: number }> {
  const stored = await getSlideFromLibrary(opts.slideId)
  if (!stored) throw new Error(`Slide "${opts.slideId}" not found in the library.`)

  return addSlide({
    rootPath: opts.rootPath,
    title: stored.name,
    content: stored.markdown,
    layout: (stored.layout as SlideLayout) || undefined,
    code: stored.codeContent && stored.codeLanguage
      ? { content: stored.codeContent, language: stored.codeLanguage as SupportedLanguage }
      : undefined,
    afterIndex: opts.afterIndex,
    format: opts.format,
  })
}

// ── AI Image Generation (for MCP server — headless, no Electron) ──

type ImageProviderType = 'openai' | 'gemini' | 'nanobanana'

async function loadEnvKey(rootPath: string, key: string): Promise<string | null> {
  // 1. Check deck's .env file
  try {
    const envContent = await readFile(join(rootPath, '.env'), 'utf-8')
    const regex = new RegExp(`${key}\\s*=\\s*(.+)`)
    const match = envContent.match(regex)
    if (match && match[1]) {
      const val = match[1].trim().replace(/^["']|["']$/g, '')
      if (val) return val
    }
  } catch {}

  // 2. Check app-level settings
  try {
    const settingsContent = await readFile(getLectaSettingsPath(), 'utf-8')
    const settings = JSON.parse(settingsContent)
    const fieldMap: Record<string, string> = {
      OPENAI_API_KEY: 'openaiApiKey',
      GEMINI_API_KEY: 'geminiApiKey',
      NANOBANANA_API_KEY: 'nanobananaApiKey',
      IMAGE_PROVIDER: 'imageProvider',
    }
    if (fieldMap[key] && settings[fieldMap[key]]) return settings[fieldMap[key]]
  } catch {}

  // 3. Check process environment
  if (process.env[key]) return process.env[key]!

  return null
}

async function generateWithOpenAI(apiKey: string, prompt: string, aspectRatio?: string): Promise<{ base64: string; mimeType: string }> {
  const sizeMap: Record<string, string> = {
    '1:1': '1024x1024',
    '16:9': '1792x1024',
    '9:16': '1024x1792',
  }
  const size = sizeMap[aspectRatio || '16:9'] || '1792x1024'

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size,
      response_format: 'b64_json',
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenAI image generation failed: ${err}`)
  }

  const data = await response.json() as any
  const b64 = data.data?.[0]?.b64_json
  if (!b64) throw new Error('No image returned from DALL-E')
  return { base64: b64, mimeType: 'image/png' }
}

async function generateWithGemini(apiKey: string, prompt: string): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    }
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gemini image generation failed: ${err}`)
  }

  const data = await response.json() as any
  const parts = data.candidates?.[0]?.content?.parts
  if (!parts) throw new Error('No content in Gemini response')

  for (const part of parts) {
    if (part.inlineData) {
      return { base64: part.inlineData.data, mimeType: part.inlineData.mimeType || 'image/png' }
    }
  }
  throw new Error('No image was generated by Gemini.')
}

async function generateWithNanoBanana(apiKey: string, prompt: string, aspectRatio?: string): Promise<{ base64: string; mimeType: string }> {
  const sizeMap: Record<string, { width: number; height: number }> = {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1792, height: 1024 },
    '9:16': { width: 1024, height: 1792 },
  }
  const size = sizeMap[aspectRatio || '16:9'] || sizeMap['16:9']

  const response = await fetch('https://api.nanobanana.com/v1/images/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'nano-banana-pro-hd',
      prompt,
      width: size.width,
      height: size.height,
      response_format: 'b64_json',
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Nano Banana image generation failed: ${err}`)
  }

  const data = await response.json() as any
  const b64 = data.data?.[0]?.b64_json || data.image?.b64_json
  if (!b64) throw new Error('No image returned from Nano Banana')
  return { base64: b64, mimeType: 'image/png' }
}

export async function generateAIImage(opts: {
  rootPath: string
  prompt: string
  provider?: ImageProviderType
  aspectRatio?: string
  slideIndex?: number
  altText?: string
}): Promise<{ imagePath: string; inserted: boolean; provider: string }> {
  // Determine provider
  let provider: ImageProviderType = opts.provider || 'openai'
  if (!opts.provider) {
    const configuredProvider = await loadEnvKey(opts.rootPath, 'IMAGE_PROVIDER')
    if (configuredProvider === 'gemini' || configuredProvider === 'openai' || configuredProvider === 'nanobanana') {
      provider = configuredProvider
    }
  }

  // Get the appropriate API key
  let apiKey: string | null = null
  let keyEnvVar: string

  switch (provider) {
    case 'nanobanana':
      keyEnvVar = 'NANOBANANA_API_KEY'
      apiKey = await loadEnvKey(opts.rootPath, keyEnvVar)
      if (!apiKey) throw new Error('No Nano Banana API key found. Add NANOBANANA_API_KEY to your .env file or app settings.')
      break
    case 'gemini':
      keyEnvVar = 'GEMINI_API_KEY'
      apiKey = await loadEnvKey(opts.rootPath, keyEnvVar)
      if (!apiKey) throw new Error('No Gemini API key found. Add GEMINI_API_KEY to your .env file or app settings.')
      break
    case 'openai':
    default:
      keyEnvVar = 'OPENAI_API_KEY'
      apiKey = await loadEnvKey(opts.rootPath, keyEnvVar)
      if (!apiKey) throw new Error('No OpenAI API key found. Add OPENAI_API_KEY to your .env file or app settings.')
      break
  }

  // Generate the image
  let result: { base64: string; mimeType: string }
  switch (provider) {
    case 'nanobanana':
      result = await generateWithNanoBanana(apiKey, opts.prompt, opts.aspectRatio)
      break
    case 'gemini':
      result = await generateWithGemini(apiKey, opts.prompt)
      break
    case 'openai':
    default:
      result = await generateWithOpenAI(apiKey, opts.prompt, opts.aspectRatio)
      break
  }

  // Save the image to the presentation's images/ directory
  const ext = result.mimeType === 'image/jpeg' ? '.jpg' : '.png'
  const fileName = `${Date.now()}-ai-${provider}${ext}`
  const imagesDir = join(opts.rootPath, 'images')
  await mkdir(imagesDir, { recursive: true })

  const buffer = Buffer.from(result.base64, 'base64')
  await writeFile(join(imagesDir, fileName), buffer)

  const imagePath = `images/${fileName}`
  let inserted = false

  // Insert into slide if slideIndex is provided
  if (opts.slideIndex != null) {
    const config = await loadPresentationConfig(opts.rootPath)
    const slide = config.slides[opts.slideIndex]
    if (!slide) throw new Error(`Slide at index ${opts.slideIndex} not found`)

    const slidePath = join(opts.rootPath, slide.content)
    let content = await readFile(slidePath, 'utf-8')

    const isMdx = slide.content.endsWith('.mdx')
    if (isMdx) {
      const alt = opts.altText || 'AI generated image'
      const imgTag = `  <img src="${imagePath}" alt="${alt}" style={{maxWidth:'100%',borderRadius:'8px'}} />`
      const lastClosingDiv = content.lastIndexOf('</div>')
      if (lastClosingDiv !== -1) {
        content = content.slice(0, lastClosingDiv) + imgTag + '\n' + content.slice(lastClosingDiv)
      } else {
        content += `\n${imgTag}\n`
      }
    } else {
      const alt = opts.altText || 'AI generated image'
      content += `\n![${alt}](${imagePath})\n`
    }

    await writeFile(slidePath, content, 'utf-8')
    inserted = true
  }

  return { imagePath, inserted, provider }
}

export { VALID_THEMES, VALID_LAYOUTS }
