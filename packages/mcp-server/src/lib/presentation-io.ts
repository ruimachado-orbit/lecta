/**
 * Core I/O layer for reading/writing Lecta presentations on disk.
 * Extracted from the Electron IPC handlers so it works headless.
 */

import { readFile, writeFile, mkdir, access, copyFile, rename, unlink, stat as fsStat } from 'fs/promises'
import { join, basename, dirname, extname, resolve } from 'path'
import { homedir } from 'os'
import { DECK_CONFIG_FILE } from '#shared/constants.js'
import {
  DEFAULT_THEME,
  SLIDE_LAYOUTS,
  SLIDE_THEMES,
  defaultEngineForLanguage,
  extensionForLanguage,
  isSlideTheme,
  nativeCommandForLanguage,
} from '#shared/slide-options.js'
import { resolveRelativePath } from '#shared/utils/path-resolver.js'
import { parsePresentationYaml, serializePresentation } from '#shared/utils/yaml-parser.js'
import type {
  ExecutionEngine,
  LoadedPresentation,
  LoadedSlide,
  Presentation,
  SlideConfig,
  SlideLayout,
  SlideTransition,
  SupportedLanguage,
} from '#shared/types/presentation.js'

// The deck manifest schema, its parser/serializer, the slide-option lists and the
// deck-relative path guard all live in packages/shared and are re-exported here, so the
// server and the app cannot drift apart on what a lecta.yaml looks like.
export { DECK_CONFIG_FILE, parsePresentationYaml, resolveRelativePath, serializePresentation }
export { SLIDE_LAYOUTS, SLIDE_THEMES }
export type {
  ExecutionEngine,
  LoadedPresentation,
  LoadedSlide,
  Presentation,
  SlideConfig,
  SlideLayout,
  SlideTransition,
  SupportedLanguage,
}

// ── Constants ──

/** Default directory for new presentations — ~/Documents/Lecta */
export function getDefaultPresentationsPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp'
  return join(home, 'Documents', 'Lecta')
}

/**
 * Generate a kebab-case slug from text. Unicode-aware: any letter or number in any
 * script is kept, so a non-Latin title does not slug to the empty string.
 */
export function toSlug(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

/** Longest slug we will put in a file or directory name. */
const MAX_SLUG_LENGTH = 60

/**
 * A slug that is always usable as a file or directory name. Falls back to a stable
 * code-point-derived name when the text has nothing slug-able in it (emoji, punctuation).
 */
export function toSafeSlug(text: string, fallback = 'untitled'): string {
  const slug = toSlug(text).slice(0, MAX_SLUG_LENGTH).replace(/-+$/, '')
  if (slug) return slug
  const codes = Array.from(text.trim())
    .map((c) => c.codePointAt(0)!.toString(16))
    .join('')
    .slice(0, 12)
  return codes ? `${fallback}-${codes}` : fallback
}

/** Expand a leading `~` to the current user's home directory. */
export function expandHome(inputPath: string): string {
  if (inputPath === '~') return homedir()
  if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
    return join(homedir(), inputPath.slice(2))
  }
  return inputPath
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

/**
 * Pick a deck-relative path that collides with neither an existing file nor one of
 * `taken`, by appending `-2`, `-3`, … before the extension.
 */
async function uniqueDeckPath(rootPath: string, candidate: string, taken: Set<string> = new Set()): Promise<string> {
  const ext = extname(candidate)
  const stem = candidate.slice(0, candidate.length - ext.length)
  let attempt = candidate
  let n = 2
  while (taken.has(attempt) || (await pathExists(join(rootPath, attempt)))) {
    attempt = `${stem}-${n}${ext}`
    n += 1
  }
  return attempt
}

/** Append `-2`, `-3`, … until the id is not already used by another slide. */
function uniqueSlideId(baseId: string, taken: Set<string>): string {
  if (!taken.has(baseId)) return baseId
  let n = 2
  while (taken.has(`${baseId}-${n}`)) n += 1
  return `${baseId}-${n}`
}

/**
 * Escape text interpolated into generated MDX. MDX treats `{`/`}` as expressions and
 * `<`/`>` as tags, so an unescaped title turns a slide into a syntax error.
 */
export function escapeMdx(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .replace(/"/g, '&quot;')
}

// ── JSON side-car files (settings, design system, slide library) ──

/**
 * Read a JSON side-car. A missing file starts fresh; a file we cannot read or parse
 * throws, so the caller never silently overwrites data it failed to understand.
 */
async function readJsonSidecar<T>(path: string, fallback: T): Promise<T> {
  let raw: string
  try {
    raw = await readFile(path, 'utf-8')
  } catch (err: any) {
    if (err?.code === 'ENOENT') return fallback
    throw new Error(`Cannot read ${path}: ${err?.message ?? err}`)
  }
  if (raw.trim() === '') return fallback
  try {
    return JSON.parse(raw) as T
  } catch (err: any) {
    throw new Error(
      `${path} is not valid JSON (${err?.message ?? err}). ` +
      `Refusing to overwrite it — repair or move the file and retry.`
    )
  }
}

/** Write via a temp file + rename so a crash mid-write cannot truncate the original. */
async function writeFileAtomic(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, contents, 'utf-8')
  try {
    await rename(tmp, path)
  } catch (err) {
    await unlink(tmp).catch(() => {})
    throw err
  }
}

async function writeJsonSidecar(path: string, data: unknown): Promise<void> {
  await writeFileAtomic(path, JSON.stringify(data, null, 2))
}

// ── Config Cache ──

const configCache = new Map<string, { config: Presentation; mtimeMs: number }>()

/**
 * Load only the YAML config (no slide content). Uses mtime-based cache.
 */
export async function assertPresentationDir(inputPath: string): Promise<string> {
  const rootPath = expandHome(inputPath)
  try {
    await access(join(rootPath, DECK_CONFIG_FILE))
  } catch {
    throw new Error(
      `"${inputPath}" is not a Lecta presentation — no ${DECK_CONFIG_FILE} found there. ` +
      `Pass the presentation's root folder (the one returned by create_presentation).`
    )
  }
  return rootPath
}

export async function loadPresentationConfig(inputPath: string): Promise<Presentation> {
  const rootPath = await assertPresentationDir(inputPath)
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

export async function loadPresentation(inputPath: string): Promise<LoadedPresentation> {
  const rootPath = await assertPresentationDir(inputPath)
  const configPath = join(rootPath, DECK_CONFIG_FILE)
  const yamlContent = await readFile(configPath, 'utf-8')
  const config = parsePresentationYaml(yamlContent, rootPath)

  const slides: LoadedSlide[] = await Promise.all(
    config.slides.map(async (slideConfig) => {
      // Every path is confined to the deck folder — a manifest must never make the
      // server read (and hand to the model) a file outside the presentation.
      let markdownContent: string
      try {
        markdownContent = await readFile(resolveRelativePath(rootPath, slideConfig.content), 'utf-8')
      } catch {
        markdownContent = `# ${slideConfig.id}`
      }

      let codeContent: string | null = null
      if (slideConfig.code) {
        try {
          codeContent = await readFile(resolveRelativePath(rootPath, slideConfig.code.file), 'utf-8')
        } catch {
          codeContent = ''
        }
      }

      let notesContent: string | null = null
      if (slideConfig.notes) {
        try {
          notesContent = await readFile(resolveRelativePath(rootPath, slideConfig.notes), 'utf-8')
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
  await writeFileAtomic(configPath, serializePresentation(presentation))
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
  const theme = isSlideTheme(opts.theme) ? opts.theme : DEFAULT_THEME
  const author = opts.author ?? ''
  const slideCount = Math.max(1, Math.min(opts.slideCount ?? 1, 50))

  const basePath = resolve(expandHome(opts.path || getDefaultPresentationsPath()))
  const slug = toSafeSlug(opts.title)
  const projectDir = resolve(basePath, slug)
  if (projectDir === basePath) {
    // A title that slugs to nothing must never turn the parent directory into the deck.
    throw new Error(
      `Cannot derive a folder name from the title "${opts.title}". ` +
      `Pass an explicit "path" ending in the folder you want the presentation created in.`
    )
  }

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
  const usedIds = new Set<string>()
  const usedPaths = new Set<string>()
  for (let i = 0; i < slideCount; i++) {
    const num = String(i + 1).padStart(2, '0')
    const title = opts.slideTitles?.[i] ?? (i === 0 ? opts.title : `Slide ${i + 1}`)
    const slideId = uniqueSlideId(toSafeSlug(title, `slide-${i + 1}`), usedIds)
    usedIds.add(slideId)
    const slideExt = opts.format === 'md' ? '.md' : '.mdx'
    const contentPath = await uniqueDeckPath(projectDir, `slides/${num}-${slideId}${slideExt}`, usedPaths)
    usedPaths.add(contentPath)

    const layout: SlideLayout | undefined = i === 0 ? 'title' : undefined
    const isMdx = opts.format !== 'md'
    let markdown: string
    if (isMdx) {
      if (i === 0) {
        markdown = `<div style={{width:'100%',height:'100%',background:'linear-gradient(135deg,#0a0e1a,#0f1729)',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',textAlign:'center',padding:'60px 80px'}}>
  <div style={{fontSize:'56px',fontWeight:800,color:'#fff',marginBottom:'24px'}}>${escapeMdx(opts.title)}</div>
  <div style={{fontSize:'24px',color:'#94a3b8'}}>${escapeMdx(author) || 'Welcome to your new presentation!'}</div>
</div>\n`
      } else {
        markdown = `<div style={{width:'100%',height:'100%',background:'linear-gradient(135deg,#0a0e1a,#0f1729)',padding:'60px 80px',position:'relative',overflow:'hidden'}}>
  <div style={{fontSize:'44px',fontWeight:800,color:'#fff',marginBottom:'40px'}}>${escapeMdx(title)}</div>
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
  const rootPath = await assertPresentationDir(opts.rootPath)
  const config = await loadPresentationConfig(rootPath)
  const insertAt = opts.afterIndex != null ? opts.afterIndex + 1 : config.slides.length

  // Auto-generate slideId from the first heading in content, or fall back to slide number.
  // Ids must be unique: index-derived ids repeat after a delete and would otherwise let a
  // new slide overwrite a live one's files.
  const headingMatch = opts.content.match(/^#\s+(.+)$/m)?.[1]
  const usedIds = new Set(config.slides.map((s) => s.id))
  const baseId = toSafeSlug(opts.slideId || headingMatch || '', `slide-${config.slides.length + 1}`)
  const autoId = uniqueSlideId(baseId, usedIds)
  const slideTitle = opts.title || headingMatch || autoId.replace(/-/g, ' ')
  const slideNum = String(config.slides.length + 1).padStart(2, '0')
  const ext = opts.format === 'md' ? '.md' : '.mdx'
  const contentPath = await uniqueDeckPath(rootPath, `slides/${slideNum}-${autoId}${ext}`)

  await mkdir(join(rootPath, 'slides'), { recursive: true })
  await writeFile(join(rootPath, contentPath), opts.content, 'utf-8')

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
    const codeExt = extensionForLanguage(opts.code.language)
    const codeFile = await uniqueDeckPath(rootPath, `code/${autoId}${codeExt}`)
    await mkdir(join(rootPath, 'code'), { recursive: true })
    await writeFile(join(rootPath, codeFile), opts.code.content, 'utf-8')

    const engine = opts.code.execution ?? defaultEngineForLanguage(opts.code.language)
    newSlide.code = { file: codeFile, language: opts.code.language, execution: engine }

    if (engine === 'native') {
      const cmd = nativeCommandForLanguage(opts.code.language)
      if (cmd) {
        newSlide.code.command = cmd
        newSlide.code.args = [codeFile]
      }
    }
  }

  // Handle notes
  if (opts.notes) {
    const notesPath = await uniqueDeckPath(rootPath, `slides/${autoId}.notes.md`)
    await writeFile(join(rootPath, notesPath), opts.notes, 'utf-8')
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
  const rootPath = config.rootPath
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
      const oldPath = resolveRelativePath(rootPath, slide.content)
      const newContentPath = slide.content.replace(/\.(mdx?|md)$/, targetExt)
      await rename(oldPath, resolveRelativePath(rootPath, newContentPath))
      slide.content = newContentPath
    }
  }

  if (opts.content !== undefined) {
    await writeFile(resolveRelativePath(rootPath, slide.content), opts.content, 'utf-8')
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

  if (opts.codeContent !== undefined) {
    if (!slide.code) {
      // Silently dropping the edit made the tool report success while changing nothing.
      throw new Error(
        `Slide ${opts.slideIndex} ("${slide.id}") has no code block, so code_content cannot be edited. ` +
        `Add the slide again with a code block, or edit the slide content instead.`
      )
    }
    await writeFile(resolveRelativePath(rootPath, slide.code.file), opts.codeContent, 'utf-8')
  }

  if (opts.codeLanguage !== undefined && slide.code) {
    slide.code.language = opts.codeLanguage
    slide.code.execution = defaultEngineForLanguage(opts.codeLanguage)
  }

  if (opts.notes !== undefined) {
    if (!slide.notes) {
      const notesPath = `slides/${slide.id}.notes.md`
      slide.notes = notesPath
    }
    await mkdir(join(rootPath, 'slides'), { recursive: true })
    await writeFile(resolveRelativePath(rootPath, slide.notes), opts.notes, 'utf-8')
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

  // Config-only load — slide bodies are not returned, but the heading is read from the
  // slide file so `heading` means the same thing with and without `include_content`.
  const config = await loadPresentationConfig(rootPath)
  const headings = await Promise.all(
    config.slides.map(async (s) => {
      if (s.title) return s.title
      try {
        const body = await readFile(resolveRelativePath(config.rootPath, s.content), 'utf-8')
        return body.match(/^#\s+(.+)$/m)?.[1]?.trim()
      } catch {
        return undefined
      }
    })
  )
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
        heading: headings[i] || s.title || s.id.replace(/-/g, ' '),
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
  if (!isSlideTheme(theme)) {
    throw new Error(`Invalid theme "${theme}". Valid themes: ${SLIDE_THEMES.join(', ')}`)
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

  await mkdir(join(config.rootPath, 'artifacts'), { recursive: true })

  const fileName = basename(opts.filePath)
  const destPath = resolveRelativePath(config.rootPath, join('artifacts', fileName))
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
  const deckRoot = await assertPresentationDir(opts.rootPath)

  const imagesDir = join(deckRoot, 'images')
  await mkdir(imagesDir, { recursive: true })

  const destName = `${Date.now()}-${basename(opts.filePath)}`
  await copyFile(opts.filePath, join(imagesDir, destName))

  const imagePath = `images/${destName}`
  let inserted = false

  if (opts.slideIndex != null) {
    const config = await loadPresentationConfig(deckRoot)
    const slide = config.slides[opts.slideIndex]
    if (!slide) throw new Error(`Slide at index ${opts.slideIndex} not found`)

    const slidePath = resolveRelativePath(config.rootPath, slide.content)
    let content = await readFile(slidePath, 'utf-8')

    const isMdx = slide.content.endsWith('.mdx')
    if (opts.position) {
      content += `\n<!-- image x=${opts.position.x} y=${opts.position.y} w=${opts.position.w} src=${imagePath} -->\n`
    } else if (isMdx) {
      const alt = escapeMdx(opts.altText || basename(opts.filePath, ext))
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

/**
 * Per-deck colour/font overrides are not read by the Lecta renderer, so writing them to
 * lecta.yaml would change nothing while reporting success. Fail loudly instead until the
 * app grows support for it.
 */
export async function customizeTheme(_opts: {
  rootPath: string
  accentColor?: string
  bgColor?: string
  textColor?: string
  headingFont?: string
  bodyFont?: string
}): Promise<never> {
  throw new Error(
    'Per-deck colour and font overrides are not supported by the Lecta app yet — the renderer ' +
    'ignores them, so saving them would silently do nothing. Use set_theme to pick one of the ' +
    `built-in themes instead: ${SLIDE_THEMES.join(', ')}.`
  )
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

  // Only a missing file starts from scratch. A settings.json we cannot read or parse is
  // left alone — rewriting it from `{}` used to wipe the user's API keys and recent decks.
  const settings = await readJsonSidecar<Record<string, any>>(settingsPath, {})

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

  await writeJsonSidecar(settingsPath, settings)
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
  const dsPath = getDesignSystemPath()
  const ds = await readJsonSidecar<DesignSystem>(dsPath, { version: 1, elements: [] })
  if (!ds || typeof ds !== 'object' || !Array.isArray(ds.elements)) {
    throw new Error(`${dsPath} does not look like a design system (no "elements" array). Refusing to overwrite it.`)
  }
  return ds
}

async function saveDesignSystem(ds: DesignSystem): Promise<void> {
  await writeJsonSidecar(getDesignSystemPath(), ds)
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

async function loadSlideLibrary(): Promise<StoredSlide[]> {
  const libPath = getSlideLibraryPath()
  const slides = await readJsonSidecar<StoredSlide[]>(libPath, [])
  if (!Array.isArray(slides)) {
    throw new Error(`${libPath} does not look like a slide library (expected a JSON array). Refusing to overwrite it.`)
  }
  return slides
}

export async function listSlideLibrary(opts?: {
  tags?: string[]
  search?: string
}): Promise<StoredSlide[]> {
  let slides = await loadSlideLibrary()

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
  const slides = await loadSlideLibrary()

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
  await writeJsonSidecar(getSlideLibraryPath(), slides)

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

type ImageProviderType = 'openai' | 'gemini'

async function loadEnvKey(rootPath: string, key: string): Promise<string | null> {
  // 1. Check deck's .env file — line by line, so a commented-out key is not picked up
  //    and `OTHER_OPENAI_API_KEY=` does not match `OPENAI_API_KEY`.
  try {
    const envContent = await readFile(join(expandHome(rootPath), '.env'), 'utf-8')
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!match || match[1] !== key) continue
      const val = match[2].trim().replace(/^(["'])(.*)\1$/, '$2').trim()
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
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
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


export async function generateAIImage(opts: {
  rootPath: string
  prompt: string
  provider?: ImageProviderType
  aspectRatio?: string
  slideIndex?: number
  altText?: string
}): Promise<{ imagePath: string; inserted: boolean; provider: string }> {
  const deckRoot = await assertPresentationDir(opts.rootPath)

  // Determine provider
  let provider: ImageProviderType = opts.provider || 'openai'
  if (!opts.provider) {
    const configuredProvider = await loadEnvKey(opts.rootPath, 'IMAGE_PROVIDER')
    if (configuredProvider === 'gemini' || configuredProvider === 'openai') {
      provider = configuredProvider
    }
  }

  // Get the appropriate API key
  let apiKey: string | null = null
  let keyEnvVar: string

  switch (provider) {
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
  const imagesDir = join(deckRoot, 'images')
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

    const slidePath = resolveRelativePath(config.rootPath, slide.content)
    let content = await readFile(slidePath, 'utf-8')

    const isMdx = slide.content.endsWith('.mdx')
    if (isMdx) {
      const alt = escapeMdx(opts.altText || 'AI generated image')
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
