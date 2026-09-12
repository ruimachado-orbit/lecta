import { ipcMain, dialog, app } from 'electron'
import { readFile, writeFile, mkdir, access, copyFile, stat } from 'fs/promises'
import { join, basename, dirname, extname, resolve } from 'path'
import { homedir } from 'os'
import { stringify as stringifyYaml } from 'yaml'
import { parsePresentationYaml, serializePresentation } from '../../../packages/shared/src/utils/yaml-parser'
import { DECK_CONFIG_FILE } from '../../../packages/shared/src/constants'
import { defaultEngineForLanguage, extensionForLanguage, nativeCommandForLanguage } from '../../../packages/shared/src/slide-options'
import {
  parseSingleFileDeck,
  materializeToFolder,
  folderToSingleFile,
  toSafeSlug
} from '../../../packages/shared/src/utils/single-file'
import { startWatching, stopWatching, addFileToWatch, markOwnWrite } from '../services/file-watcher'
import { setAIDeckPath } from './ai'
import {
  registerDeckRoot,
  unregisterDeckRoot,
  assertInsideOpenDeck,
  resolveInsideDeck
} from '../services/deck-roots'
import { atomicWriteFile, writeFileIfMissing, withLock } from '../services/safe-fs'
import { setGeminiDeckPath } from './gemini-image'
import { updateSettings } from './settings'
import {
  openLectaFile,
  saveLectaFile,
  createLectaFile,
  withExtractedLectaFile,
  registerWorkspace,
  unregisterWorkspace,
  autoSave,
  flushAutoSave,
  getLectaFilePath
} from '../services/lecta-file'
import { importPptx } from '../services/pptx-importer'
import { importIpynb } from '../services/ipynb-importer'
import type {
  LoadedPresentation,
  LoadedSlide,
  Presentation,
  SlideConfig,
  SupportedLanguage,
  ExecutionEngine
} from '../../../packages/shared/src/types/presentation'

interface RecentDeck {
  path: string
  title: string
  date: string
  type?: 'presentation' | 'notebook'
  slideCount: number
  firstSlidePreview: string
  firstSlideContent?: string
  firstSlideIsMdx?: boolean
  theme?: string
  artifacts: string[]
}

let recentDecks: RecentDeck[] = []

/** Cap on a single dropped/pasted image, so a stray paste cannot fill the deck folder. */
const MAX_DROPPED_IMAGE_BYTES = 25 * 1024 * 1024

/** Image media types accepted from a drop or paste, and the extension each is saved with. */
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg'
}

/** Returns ~/Documents/Lecta, creating it if it doesn't exist */
function getLectaDocumentsDir(): string {
  return join(homedir(), 'Documents', 'Lecta')
}

async function ensureLectaDocumentsDir(): Promise<string> {
  const dir = getLectaDocumentsDir()
  await mkdir(dir, { recursive: true })
  return dir
}

async function getSettingsPath(): Promise<string> {
  const { app } = await import('electron')
  return join(app.getPath('userData'), 'settings.json')
}

/** Add an item to the recent decks list (used by both presentation and notebook loaders) */
export async function addRecentItem(item: {
  path: string; title: string; type?: 'presentation' | 'notebook'
  slideCount: number; firstSlidePreview: string; artifacts: string[]
  firstSlideContent?: string; firstSlideIsMdx?: boolean; theme?: string
}): Promise<void> {
  const entry: RecentDeck = { ...item, date: new Date().toISOString() }
  recentDecks = [entry, ...recentDecks.filter((d) => d.path !== item.path)].slice(0, 20)
  await persistRecentDecks()

  // Also register in the presentation library (prefer .lecta file path over workspace dir)
  try {
    const { upsertLibraryEntry } = await import('./library')
    const { getLectaFilePath } = await import('../services/lecta-file')
    const libraryPath = getLectaFilePath(item.path) || item.path
    await upsertLibraryEntry({
      path: libraryPath,
      title: item.title,
      type: item.type,
      slideCount: item.slideCount,
      firstSlidePreview: item.firstSlidePreview,
      firstSlideContent: item.firstSlideContent,
      firstSlideIsMdx: item.firstSlideIsMdx,
      theme: item.theme,
    })
  } catch {}
}

/**
 * Persist `recentDecks` into settings.json. Runs under the shared 'settings'
 * lock and writes atomically (0600). A settings file that exists but cannot
 * be parsed is left untouched — never rewrite what we failed to read.
 */
async function persistRecentDecks(): Promise<void> {
  try {
    // Single settings writer: merges into the cached settings and writes
    // atomically (0600) under the shared 'settings' lock.
    await updateSettings({ recentDecks })
  } catch (err) {
    // Non-critical
    console.warn('[file-system] Failed to persist recent decks:', err)
  }
}

/** Presentation handlers must never rewrite a notebook's lecta.yaml as a presentation. */
function looksLikeNotebook(yamlContent: string): boolean {
  return /^type:\s*["']?notebook["']?\s*$/m.test(yamlContent)
}

/** Read + parse lecta.yaml for the deck at `root` (caller holds the lock). */
async function readPresentationConfig(root: string): Promise<Presentation> {
  const yamlContent = await readFile(join(root, DECK_CONFIG_FILE), 'utf-8')
  if (looksLikeNotebook(yamlContent)) {
    throw new Error('This deck is a notebook; use the notebook handlers')
  }
  return parsePresentationYaml(yamlContent, root)
}

/**
 * Read → mutate → write lecta.yaml for an open deck, serialized per deck root
 * and written atomically. Returns the mutated config.
 */
async function mutatePresentationConfig(
  rootPath: string,
  mutate: (config: Presentation, root: string) => void | Promise<void>
): Promise<Presentation> {
  const root = assertInsideOpenDeck(rootPath)
  return withLock(root, async () => {
    const config = await readPresentationConfig(root)
    await mutate(config, root)
    await writePresentationYaml(config)
    await autoSave(root)
    return config
  })
}

/** Like `mutatePresentationConfig`, then reload the full presentation for the renderer. */
async function updatePresentation(
  rootPath: string,
  mutate: (config: Presentation, root: string) => void | Promise<void>
): Promise<LoadedPresentation> {
  const root = assertInsideOpenDeck(rootPath)
  return withLock(root, async () => {
    const config = await readPresentationConfig(root)
    await mutate(config, root)
    await writePresentationYaml(config)
    await autoSave(root)

    const reloadedConfig = await readPresentationConfig(root)
    const slides = await loadAllSlides(reloadedConfig, root)
    return { config: reloadedConfig, slides }
  })
}

/**
 * Create a new content file under `slides/`, picking a non-colliding name so
 * an existing slide file is never truncated. Returns the deck-relative path.
 */
async function createSlideFile(root: string, baseName: string, ext: string, content: string): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const rel = `slides/${baseName}${attempt === 0 ? '' : `-${attempt + 1}`}${ext}`
    const abs = resolveInsideDeck(root, rel)
    await mkdir(dirname(abs), { recursive: true })
    if (await writeFileIfMissing(abs, content)) return rel
  }
  throw new Error(`Could not find a free filename for slides/${baseName}${ext}`)
}

/** Write the current presentation config back to lecta.yaml (atomic; caller holds the deck lock and triggers autoSave) */
async function writePresentationYaml(presentation: Presentation): Promise<void> {
  const configPath = join(presentation.rootPath, DECK_CONFIG_FILE)
  // Shared serializer: one place decides the on-disk shape, and unknown keys
  // written by newer versions or the MCP server survive a round-trip.
  const { rootPath: _rootPath, ...config } = presentation
  void _rootPath
  await atomicWriteFile(configPath, serializePresentation(config as Presentation))
}

/** Extensions we accept as a single-file deck (see packages/shared/src/utils/single-file.ts). */
const SINGLE_FILE_EXTENSIONS = new Set(['.md', '.markdown'])

/** A "single file deck" this big is not a deck; refuse before parsing it. */
const MAX_SINGLE_FILE_BYTES = 8 * 1024 * 1024

/** Is this path one we would open as a single-file deck? */
function isSingleFileDeckPath(filePath: string): boolean {
  return SINGLE_FILE_EXTENSIONS.has(extname(filePath).toLowerCase())
}

/**
 * Materialize a single markdown file into a real deck folder next to it and open that.
 * The folder format stays canonical — the markdown file is only an on-ramp.
 *
 * Refuses when the sibling folder already exists (the `mkdir` without `recursive` is the
 * atomic check) so an existing deck can never be half-overwritten, and code files are
 * written with `writeFileIfMissing` so authored code is never truncated.
 * Returns the folder path for the renderer to load as usual.
 */
async function openSingleFileDeck(mdPath: string): Promise<string> {
  if (typeof mdPath !== 'string' || mdPath.length === 0) {
    throw new Error('No Markdown file given')
  }
  const source = resolve(mdPath)
  if (!isSingleFileDeckPath(source)) {
    throw new Error(`Not a Markdown file: ${basename(source)}`)
  }

  const info = await stat(source).catch(() => null)
  if (!info || !info.isFile()) {
    throw new Error(`Cannot read ${source}`)
  }
  if (info.size > MAX_SINGLE_FILE_BYTES) {
    throw new Error(`${basename(source)} is too large to open as a single-file deck (limit 8 MB)`)
  }

  const parsed = parseSingleFileDeck(await readFile(source, 'utf-8'))
  for (const warning of parsed.warnings) {
    console.warn(`[single-file] ${basename(source)}: ${warning}`)
  }
  if (parsed.slides.length === 0) {
    throw new Error(
      `${basename(source)} has no slides. Separate slides with a line containing only "---".`
    )
  }

  const folderPath = join(dirname(source), basename(source, extname(source)))
  try {
    await mkdir(folderPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(
        `"${folderPath}" already exists — rename or move it, then open ${basename(source)} again.`
      )
    }
    throw err
  }

  const { files } = materializeToFolder(folderPath, parsed)
  for (const file of files) {
    const target = resolveInsideDeck(folderPath, file.relativePath)
    await mkdir(dirname(target), { recursive: true })
    if (file.kind === 'code') {
      // Never truncate code that is already there (a re-open into a fresh folder still
      // creates it; this only matters if something else got there first).
      await writeFileIfMissing(target, file.content)
    } else {
      await atomicWriteFile(target, file.content)
    }
  }

  // The deck is on disk and parses — let fs:* and lecta-file:// serve it.
  return registerDeckRoot(folderPath)
}

export function registerFileSystemHandlers(): void {
  // Open a deck folder, a .lecta / .pptx / .ipynb file, or a single-file (.md) deck
  ipcMain.handle('fs:open-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'openFile'],
      defaultPath: getLectaDocumentsDir(),
      filters: [
        { name: 'All Supported', extensions: ['lecta', 'md', 'markdown', 'pptx', 'ipynb'] },
        { name: 'Lecta Presentations', extensions: ['lecta'] },
        { name: 'Markdown Deck', extensions: ['md', 'markdown'] },
        { name: 'PowerPoint', extensions: ['pptx'] },
        { name: 'Jupyter Notebook', extensions: ['ipynb'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      title: 'Open Presentation or Notebook'
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const selected = result.filePaths[0]
    const ext = extname(selected).toLowerCase()

    // Handle .lecta file — extract to temp workspace
    if (ext === '.lecta') {
      const workspaceDir = await openLectaFile(selected)
      registerWorkspace(workspaceDir, selected)
      return workspaceDir
    }

    // Handle .pptx file — import into a new .lecta file
    if (ext === '.pptx') {
      const savePath = selected.replace(/\.pptx$/i, '.lecta')
      const workspaceDir = await createLectaFile(savePath, basename(selected, '.pptx'))
      await importPptx(selected, workspaceDir)
      await saveLectaFile(workspaceDir, savePath)
      registerWorkspace(workspaceDir, savePath)
      return workspaceDir
    }

    // Handle .ipynb file — import into a new .lecta notebook
    if (ext === '.ipynb') {
      const savePath = selected.replace(/\.ipynb$/i, '.lecta')
      const workspaceDir = await createLectaFile(savePath, basename(selected, '.ipynb'))
      await importIpynb(selected, workspaceDir)
      await saveLectaFile(workspaceDir, savePath)
      registerWorkspace(workspaceDir, savePath)
      return workspaceDir
    }

    // Handle a single markdown file — materialize it into a sibling deck folder
    if (SINGLE_FILE_EXTENSIONS.has(ext)) {
      return openSingleFileDeck(selected)
    }

    // Regular folder
    return selected
  })

  /**
   * Open a single-file deck by path (drag-and-drop, a recent entry, the CLI).
   * Same trust model as `fs:open-lecta-path`: the path names a file the user already
   * has, and the only thing written is a NEW sibling folder — an existing one is
   * refused rather than merged into.
   */
  ipcMain.handle('fs:open-single-file', async (_event, mdPath: string): Promise<string> =>
    openSingleFileDeck(mdPath)
  )

  /**
   * Export an open deck back to one markdown file, via a save dialog. The deck itself is
   * untouched; the chosen destination is written atomically.
   */
  ipcMain.handle('fs:export-single-file', async (_event, rootPath: string): Promise<string | null> => {
    const root = assertInsideOpenDeck(rootPath)
    const config = await readPresentationConfig(root)
    const slides = await loadAllSlides(config, root)

    // For a .lecta deck the workspace lives in a temp dir — offer the archive's folder.
    const lectaPath = getLectaFilePath(root)
    const defaultDir = lectaPath ? dirname(lectaPath) : dirname(root)
    const result = await dialog.showSaveDialog({
      title: 'Export as single Markdown file',
      defaultPath: join(defaultDir, `${toSafeSlug(config.title, 'deck')}.md`),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (result.canceled || !result.filePath) return null

    await atomicWriteFile(result.filePath, folderToSingleFile(config, slides))
    return result.filePath
  })

  // Open a .lecta file by path — extract to workspace and return workspace dir
  ipcMain.handle('fs:open-lecta-path', async (_event, lectaFilePath: string): Promise<string> => {
    if (typeof lectaFilePath !== 'string' || extname(lectaFilePath).toLowerCase() !== '.lecta') {
      throw new Error('Not a .lecta file')
    }
    const workspaceDir = await openLectaFile(lectaFilePath)
    registerWorkspace(workspaceDir, lectaFilePath)
    return workspaceDir
  })

  // Import slides from another .lecta file
  ipcMain.handle('fs:import-slides', async (): Promise<{ id: string; markdown: string; layout?: string }[] | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Lecta Presentations', extensions: ['lecta'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      title: 'Import Slides From...'
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const selected = result.filePaths[0]
    try {
      // Extract to a throwaway dir: the selected deck may be open, and its
      // live workspace must not be replaced or removed.
      return await withExtractedLectaFile(selected, async (workspaceDir) => {
        const configPath = join(workspaceDir, DECK_CONFIG_FILE)
        const yamlContent = await readFile(configPath, 'utf-8')
        const config = parsePresentationYaml(yamlContent, workspaceDir)

        const slides: { id: string; markdown: string; layout?: string }[] = []
        for (const slideConfig of config.slides) {
          try {
            const mdPath = resolveInsideDeck(workspaceDir, slideConfig.content)
            const markdown = await readFile(mdPath, 'utf-8')
            slides.push({
              id: slideConfig.id,
              markdown,
              layout: slideConfig.layout
            })
          } catch {
            slides.push({ id: slideConfig.id, markdown: `# ${slideConfig.id}` })
          }
        }
        return slides
      })
    } catch {
      return null
    }
  })

  // Select a file (for AI generation source)
  ipcMain.handle('fs:select-file', async (_event, filters?: { name: string; extensions: string[] }[]) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filters || [
        { name: 'Documents', extensions: ['txt', 'md', 'pdf', 'csv', 'json', 'docx', 'html'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      title: 'Select Source File'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('fs:select-folder', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Source Folder'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // Create a new .lecta file (presentation or notebook)
  ipcMain.handle('fs:create-lecta-file', async (_event, name: string, docType?: string): Promise<string | null> => {
    const isNotebook = docType === 'notebook'
    const lectaDir = await ensureLectaDocumentsDir()
    const result = await dialog.showSaveDialog({
      title: isNotebook ? 'Create New Notebook' : 'Create New Presentation',
      defaultPath: join(lectaDir, `${name}.lecta`),
      filters: [{ name: 'Lecta File', extensions: ['lecta'] }]
    })

    if (result.canceled || !result.filePath) {
      return null
    }

    const lectaFilePath = result.filePath
    const workspaceDir = await createLectaFile(lectaFilePath, name, isNotebook ? 'notebook' : 'presentation')
    registerWorkspace(workspaceDir, lectaFilePath)
    return workspaceDir
  })

  // Save workspace back to .lecta file explicitly (runs any pending auto-save now)
  ipcMain.handle('fs:save-lecta', async (_event, rootPath: string): Promise<void> => {
    await flushAutoSave(assertInsideOpenDeck(rootPath))
  })

  // Close a deck: flush pending saves, stop watchers, forget the workspace and
  // drop the root from the allow-list (lecta-file:// and fs:* stop serving it).
  ipcMain.handle('fs:close-presentation', async (_event, rootPath: string): Promise<void> => {
    if (typeof rootPath !== 'string' || rootPath.length === 0) return
    const root = resolve(rootPath)
    stopWatching(root)
    await unregisterWorkspace(root)
    unregisterDeckRoot(root)
  })

  ipcMain.handle('fs:load-presentation', async (_event, folderPath: string): Promise<LoadedPresentation> => {
    if (typeof folderPath !== 'string' || folderPath.length === 0) {
      throw new Error('No presentation path given')
    }
    const configPath = join(folderPath, DECK_CONFIG_FILE)

    try {
      await access(configPath)
    } catch {
      throw new Error(`No ${DECK_CONFIG_FILE} found in ${folderPath}`)
    }

    const yamlContent = await readFile(configPath, 'utf-8')

    // Check if this is a notebook — return a special marker so the renderer can redirect
    // (nb:load registers the root once the notebook YAML parses)
    if (looksLikeNotebook(yamlContent)) {
      return { __notebook: true, rootPath: folderPath } as any
    }

    const config = parsePresentationYaml(yamlContent, folderPath)

    // Only a deck whose lecta.yaml parsed becomes readable via lecta-file:// and fs:*
    const resolvedRoot = registerDeckRoot(folderPath)

    // Load all slide content
    const slides: LoadedSlide[] = await loadAllSlides(config, resolvedRoot)

    // Track recent decks and set AI deck path
    const allArtifacts = new Set<string>()
    config.slides.forEach((s) => {
      if (s.code) allArtifacts.add('code')
      if (s.video) allArtifacts.add('video')
      if (s.webapp) allArtifacts.add('webapp')
      if (s.artifacts.length > 0) allArtifacts.add('files')
    })
    const firstSlide = slides[0]
    const preview = firstSlide?.markdownContent
      ?.replace(/<!--.*?-->/gs, '')
      .trim()
      .split('\n')
      .filter((l: string) => l.trim())
      .slice(0, 5)
      .join('\n') || ''

    await addRecentItem({
      path: folderPath,
      title: config.title,
      slideCount: config.slides.length,
      firstSlidePreview: preview.slice(0, 200),
      firstSlideContent: firstSlide?.markdownContent || '',
      firstSlideIsMdx: firstSlide ? config.slides[0]?.content.endsWith('.mdx') : false,
      theme: config.theme,
      artifacts: Array.from(allArtifacts)
    })
    await setAIDeckPath(folderPath)
    await setGeminiDeckPath(folderPath)

    // Start watching code files for changes
    const codeFiles = config.slides
      .filter((s) => s.code)
      .map((s) => resolveInsideDeck(resolvedRoot, s.code!.file))
    startWatching(resolvedRoot, codeFiles)

    return { config, slides }
  })

  ipcMain.handle('fs:create-presentation', async (_event, name: string): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose location for new presentation'
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const parentDir = result.filePaths[0]
    // `name` comes from the renderer: keep the new folder inside the chosen parent
    const projectDir = resolveInsideDeck(parentDir, name)

    // Create folder structure
    await mkdir(join(projectDir, 'slides'), { recursive: true })
    await mkdir(join(projectDir, 'code'), { recursive: true })

    // Write starter slide
    await writeFile(
      join(projectDir, 'slides', '01-welcome.md'),
      `# ${name}\n\nWelcome to your new presentation!\n`,
      'utf-8'
    )

    // Write lecta.yaml
    const yaml = stringifyYaml({
      title: name,
      author: '',
      theme: 'dark',
      slides: [{ id: 'welcome', content: 'slides/01-welcome.md', artifacts: [] }]
    })

    await writeFile(join(projectDir, DECK_CONFIG_FILE), yaml, 'utf-8')

    return projectDir
  })

  // Add a new slide to the presentation
  ipcMain.handle(
    'fs:add-slide',
    async (_event, rootPath: string, slideId: string, afterIndex: number, format?: string): Promise<LoadedPresentation> =>
      updatePresentation(rootPath, async (config, root) => {
        // Determine slide number and extension for file naming
        const slideNum = String(config.slides.length + 1).padStart(2, '0')
        const ext = format === 'mdx' ? '.mdx' : '.md'

        // Create the content file (never truncates an existing one)
        const title = slideId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        const initialContent = format === 'mdx'
          ? `# ${title}\n\nThis is an MDX slide. You can use JSX here for richer visuals.\n`
          : `# ${title}\n\n`
        const contentPath = await createSlideFile(root, `${slideNum}-${slideId}`, ext, initialContent)

        // Insert new slide config
        const newSlide: SlideConfig = {
          id: slideId,
          content: contentPath,
          prompts: [],
          artifacts: []
        }
        config.slides.splice(afterIndex + 1, 0, newSlide)
      })
  )

  // Add code to an existing slide
  ipcMain.handle(
    'fs:add-code-to-slide',
    async (
      _event,
      rootPath: string,
      slideIndex: number,
      language: SupportedLanguage
    ): Promise<LoadedPresentation> => {
      let createdCodePath: string | null = null
      const result = await updatePresentation(rootPath, async (config, root) => {
        const slide = config.slides[slideIndex]
        if (!slide) throw new Error(`Slide at index ${slideIndex} not found`)
        if (slide.code) throw new Error('Slide already has code attached')

        // Determine file extension (shared helper; keeps app and MCP server identical)
        const ext = extensionForLanguage(language)
        const codeFile = `code/${slide.id}${ext}`

        // Create the code file only if it does not exist yet (never truncate)
        const codePath = resolveInsideDeck(root, codeFile)
        await mkdir(dirname(codePath), { recursive: true })
        await writeFileIfMissing(codePath, '')
        createdCodePath = codePath

        // Update slide config
        const engine = defaultEngineForLanguage(language)
        slide.code = {
          file: codeFile,
          language,
          execution: engine
        }
        if (engine === 'native') {
          slide.code.command = nativeCommandForLanguage(language) || language
          slide.code.args = [codeFile]
        }
      })

      // Follow external edits to the new code file
      if (createdCodePath) addFileToWatch(result.config.rootPath, createdCodePath)
      return result
    }
  )

  // Add an artifact to a slide
  ipcMain.handle(
    'fs:add-artifact',
    async (_event, rootPath: string, slideIndex: number): Promise<LoadedPresentation | null> => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        title: 'Select artifact files'
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      return updatePresentation(rootPath, async (config, root) => {
        const slide = config.slides[slideIndex]
        if (!slide) throw new Error(`Slide at index ${slideIndex} not found`)

        // Copy each file into artifacts/ folder and add to config
        await mkdir(join(root, 'artifacts'), { recursive: true })
        for (const filePath of result.filePaths) {
          const fileName = basename(filePath)
          const destPath = resolveInsideDeck(root, `artifacts/${fileName}`)
          await copyFile(filePath, destPath)

          const label = fileName.replace(extname(fileName), '')
          slide.artifacts.push({
            path: `artifacts/${fileName}`,
            label
          })
        }
      })
    }
  )

  // Add a video to a slide
  ipcMain.handle(
    'fs:add-video',
    async (_event, rootPath: string, slideIndex: number, url: string, label?: string): Promise<LoadedPresentation> =>
      updatePresentation(rootPath, (config) => {
        const slide = config.slides[slideIndex]
        if (!slide) throw new Error(`Slide at index ${slideIndex} not found`)

        slide.video = { url, label }
      })
  )

  // Add a webapp to a slide
  ipcMain.handle(
    'fs:add-webapp',
    async (_event, rootPath: string, slideIndex: number, url: string, label?: string): Promise<LoadedPresentation> =>
      updatePresentation(rootPath, (config) => {
        const slide = config.slides[slideIndex]
        if (!slide) throw new Error(`Slide at index ${slideIndex} not found`)

        slide.webapp = { url, label }
      })
  )

  // Add a prompt artifact to a slide
  ipcMain.handle(
    'fs:add-prompt',
    async (_event, rootPath: string, slideIndex: number, prompt: string, label?: string): Promise<LoadedPresentation> =>
      updatePresentation(rootPath, (config) => {
        const slide = config.slides[slideIndex]
        if (!slide) throw new Error(`Slide at index ${slideIndex} not found`)

        if (!slide.prompts) slide.prompts = []
        slide.prompts.push({ prompt, label })
      })
  )

  // Update a prompt's text and/or response
  ipcMain.handle(
    'fs:update-prompt',
    async (
      _event,
      rootPath: string,
      slideIndex: number,
      promptIndex: number,
      promptText: string,
      response?: string
    ): Promise<LoadedPresentation> =>
      updatePresentation(rootPath, (config) => {
        const slide = config.slides[slideIndex]
        if (!slide) throw new Error(`Slide at index ${slideIndex} not found`)
        if (!slide.prompts?.[promptIndex]) throw new Error(`Prompt at index ${promptIndex} not found`)

        slide.prompts[promptIndex].prompt = promptText
        if (response !== undefined) {
          slide.prompts[promptIndex].response = response
        }
      })
  )

  // Add multiple slides at once (for AI bulk generation)
  ipcMain.handle(
    'fs:add-bulk-slides',
    async (
      _event,
      rootPath: string,
      slides: { id: string; markdown: string }[],
      afterIndex: number
    ): Promise<LoadedPresentation> =>
      updatePresentation(rootPath, async (config, root) => {
        const newConfigs: SlideConfig[] = []
        for (let i = 0; i < slides.length; i++) {
          const slide = slides[i]
          const slideNum = String(config.slides.length + i + 1).padStart(2, '0')
          const contentPath = await createSlideFile(root, `${slideNum}-${slide.id}`, '.md', slide.markdown)

          newConfigs.push({
            id: slide.id,
            content: contentPath,
            prompts: [],
            artifacts: []
          })
        }

        // Insert after the specified index
        config.slides.splice(afterIndex + 1, 0, ...newConfigs)
      })
  )

  // Delete a slide
  ipcMain.handle(
    'fs:delete-slide',
    async (_event, rootPath: string, slideIndex: number): Promise<LoadedPresentation> =>
      updatePresentation(rootPath, (config) => {
        if (config.slides.length <= 1) throw new Error('Cannot delete the last slide')

        config.slides.splice(slideIndex, 1)
      })
  )

  // Rename a slide
  ipcMain.handle(
    'fs:rename-slide',
    async (_event, rootPath: string, slideIndex: number, newId: string): Promise<LoadedPresentation> =>
      updatePresentation(rootPath, (config) => {
        const slide = config.slides[slideIndex]
        if (!slide) throw new Error(`Slide at index ${slideIndex} not found`)

        slide.id = newId
      })
  )

  // Reorder slides
  ipcMain.handle(
    'fs:reorder-slide',
    async (_event, rootPath: string, fromIndex: number, toIndex: number): Promise<LoadedPresentation> =>
      updatePresentation(rootPath, (config) => {
        if (fromIndex < 0 || fromIndex >= config.slides.length || toIndex < 0 || toIndex >= config.slides.length) {
          throw new Error(`Invalid reorder indices: ${fromIndex} -> ${toIndex}`)
        }
        const [moved] = config.slides.splice(fromIndex, 1)
        config.slides.splice(toIndex, 0, moved)
      })
  )

  // Save notes content for a slide (creates file + updates YAML if needed)
  ipcMain.handle(
    'fs:save-notes',
    async (_event, rootPath: string, slideIndex: number, content: string): Promise<string> => {
      const root = assertInsideOpenDeck(rootPath)
      return withLock(root, async () => {
        const config = await readPresentationConfig(root)

        const slide = config.slides[slideIndex]
        if (!slide) throw new Error(`Slide at index ${slideIndex} not found`)

        // Create notes file path if not already set
        if (!slide.notes) {
          slide.notes = `slides/${slide.id}.notes.md`
          await writePresentationYaml(config)
        }

        // Write notes content to file — the YAML-supplied path must stay inside the deck
        const notesFullPath = resolveInsideDeck(root, slide.notes)
        await mkdir(dirname(notesFullPath), { recursive: true })
        await atomicWriteFile(notesFullPath, content)

        // Auto-save to .lecta (once)
        await autoSave(root)

        return slide.notes
      })
    }
  )

  // Save slide drawings
  ipcMain.handle(
    'fs:save-drawings',
    async (_event, rootPath: string, slideIndex: number, drawingsJson: string): Promise<void> => {
      await mutatePresentationConfig(rootPath, (config) => {
        const slide = config.slides[slideIndex]
        if (!slide) throw new Error(`Slide at index ${slideIndex} not found`)
        slide.drawings = drawingsJson || undefined
      })
    }
  )

  // Save slide groups
  ipcMain.handle(
    'fs:save-groups',
    async (_event, rootPath: string, groups: { id: string; name: string; slideIds: string[]; color?: string }[]): Promise<void> => {
      await mutatePresentationConfig(rootPath, (config) => {
        config.groups = groups
      })
    }
  )

  // Set slide transition direction
  ipcMain.handle(
    'fs:set-transition',
    async (_event, rootPath: string, slideIndex: number, transition: string): Promise<LoadedPresentation> =>
      updatePresentation(rootPath, (config) => {
        const slide = config.slides[slideIndex]
        if (!slide) throw new Error(`Slide at index ${slideIndex} not found`)

        slide.transition = transition as any
      })
  )

  // Set slide layout
  ipcMain.handle(
    'fs:set-layout',
    async (_event, rootPath: string, slideIndex: number, layout: string): Promise<LoadedPresentation> =>
      updatePresentation(rootPath, (config) => {
        const slide = config.slides[slideIndex]
        if (!slide) throw new Error(`Slide at index ${slideIndex} not found`)

        slide.layout = layout as any
        if (layout === 'default') delete (slide as any).layout
      })
  )

  // Set or clear a slide's backdrop (colour / gradient / image / overlay)
  ipcMain.handle(
    'fs:set-slide-background',
    async (
      _event,
      rootPath: string,
      slideIndex: number,
      background: { color?: string; gradient?: string; image?: string; overlay?: number } | null
    ): Promise<LoadedPresentation> =>
      updatePresentation(rootPath, (config) => {
        const slide = config.slides[slideIndex]
        if (!slide) throw new Error(`Slide at index ${slideIndex} not found`)
        if (!background) {
          delete (slide as any).background
          return
        }
        const next: { color?: string; gradient?: string; image?: string; overlay?: number } = {}
        const isCssColorish = (v: unknown): v is string => typeof v === 'string' && v.length <= 200 && !/[<>{};]|url\(|expression\(/i.test(v)
        if (isCssColorish(background.color)) next.color = background.color
        if (isCssColorish(background.gradient)) next.gradient = background.gradient
        if (typeof background.image === 'string' && background.image) {
          // Deck-relative only; throws on absolute paths or traversal
          resolveInsideDeck(rootPath, background.image)
          next.image = background.image
        }
        if (typeof background.overlay === 'number' && Number.isFinite(background.overlay)) {
          next.overlay = Math.min(1, Math.max(0, background.overlay))
        }
        if (next.color || next.gradient || next.image) (slide as any).background = next
        else delete (slide as any).background
      })
  )

  // Set presentation theme
  ipcMain.handle(
    'fs:set-theme',
    async (_event, rootPath: string, themeId: string): Promise<void> => {
      await mutatePresentationConfig(rootPath, (config) => {
        config.theme = themeId
      })
    }
  )

  // Update presenter notes (notes taken during the presentation)
  ipcMain.handle(
    'fs:update-presenter-notes',
    async (_event, rootPath: string, notes: string): Promise<void> => {
      await mutatePresentationConfig(rootPath, (config) => {
        config.presenterNotes = notes || undefined
      })
    }
  )

  // Toggle skip/hidden on a slide
  ipcMain.handle(
    'fs:toggle-skip',
    async (_event, rootPath: string, slideIndex: number): Promise<LoadedPresentation> =>
      updatePresentation(rootPath, (config) => {
        const slide = config.slides[slideIndex]
        if (!slide) throw new Error(`Slide at index ${slideIndex} not found`)
        slide.skipped = !slide.skipped
        if (!slide.skipped) delete (slide as any).skipped
      })
  )

  // Remove an attachment (code, video, webapp, or file artifact) from a slide
  ipcMain.handle(
    'fs:remove-attachment',
    async (
      _event,
      rootPath: string,
      slideIndex: number,
      type: 'code' | 'video' | 'webapp' | 'prompt' | 'artifact',
      artifactIndex?: number
    ): Promise<LoadedPresentation> =>
      // (readPresentationConfig refuses to treat a notebook as a presentation)
      updatePresentation(rootPath, (config) => {
      const slide = config.slides[slideIndex]
      if (!slide) throw new Error(`Slide at index ${slideIndex} not found`)

      switch (type) {
        case 'code':
          delete slide.code
          break
        case 'video':
          delete slide.video
          break
        case 'webapp':
          delete slide.webapp
          break
        case 'prompt':
          if (typeof artifactIndex === 'number' && slide.prompts) {
            slide.prompts.splice(artifactIndex, 1)
          }
          break
        case 'artifact':
          if (typeof artifactIndex === 'number') {
            slide.artifacts.splice(artifactIndex, 1)
          }
          break
      }
      })
  )

  ipcMain.handle('fs:read-file', async (_event, filePath: string): Promise<string> => {
    return readFile(assertInsideOpenDeck(filePath), 'utf-8')
  })

  ipcMain.handle('fs:write-file', async (_event, filePath: string, content: string): Promise<void> => {
    const target = assertInsideOpenDeck(filePath)
    if (typeof content !== 'string') throw new Error('File content must be a string')
    // Tell the watcher this change is ours so it is not echoed back over the editor
    markOwnWrite(target, content)
    await atomicWriteFile(target, content)
  })

  // Upload an image into the workspace and return the relative path
  ipcMain.handle(
    'fs:upload-image',
    async (_event, rootPath: string): Promise<string | null> => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'] }
        ],
        title: 'Select an image'
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const root = assertInsideOpenDeck(rootPath)
      const srcPath = result.filePaths[0]
      const fileName = basename(srcPath)
      const imagesDir = join(root, 'images')
      await mkdir(imagesDir, { recursive: true })

      // Avoid name collisions
      const destName = `${Date.now()}-${fileName}`
      await copyFile(srcPath, resolveInsideDeck(root, `images/${destName}`))

      // Auto-save to .lecta if applicable
      await autoSave(root)

      return `images/${destName}`
    }
  )

  /**
   * Import an image that was dropped onto, or pasted into, the slide canvas.
   *
   * The renderer only ever hands over bytes (a data URL) and a display name — never a
   * host path — so nothing outside the deck can be read, and the destination is confined
   * to `<deck>/images/` by `assertInsideOpenDeck` + `resolveInsideDeck`. Returns the
   * deck-relative path to store in the slide markdown.
   */
  ipcMain.handle(
    'fs:import-dropped-image',
    async (_event, rootPath: string, fileName: string, dataUrl: string): Promise<string | null> => {
      const root = assertInsideOpenDeck(rootPath)
      if (typeof dataUrl !== 'string') throw new Error('Dropped image must be a data URL')

      const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim())
      if (!match) throw new Error('Dropped image must be a base64 image data URL')

      const bytes = Buffer.from(match[2], 'base64')
      if (bytes.length === 0) throw new Error('Dropped image is empty')
      if (bytes.length > MAX_DROPPED_IMAGE_BYTES) {
        throw new Error(`Dropped image is larger than ${MAX_DROPPED_IMAGE_BYTES / (1024 * 1024)} MB`)
      }

      const ext = IMAGE_EXTENSIONS[match[1].toLowerCase()]
      if (!ext) throw new Error(`Unsupported image type: ${match[1]}`)

      // Only the base name is used, stripped to safe characters — a name like
      // "../../evil.png" or "C:\evil.png" can never escape the images folder.
      const stem =
        basename(typeof fileName === 'string' ? fileName : '', extname(fileName || ''))
          .replace(/[^A-Za-z0-9._-]+/g, '-')
          .replace(/^[-.]+/, '')
          .slice(0, 60) || 'image'

      await mkdir(join(root, 'images'), { recursive: true })
      const relative = `images/${Date.now()}-${stem}${ext}`
      await atomicWriteFile(resolveInsideDeck(root, relative), bytes)
      await autoSave(root)
      return relative
    }
  )

  ipcMain.handle('fs:remove-recent-deck', async (_event, path: string): Promise<void> => {
    recentDecks = recentDecks.filter((d) => d.path !== path)
    await persistRecentDecks()
  })

  ipcMain.handle('fs:get-recent-decks', async (): Promise<RecentDeck[]> => {
    // Always re-read from disk so we pick up changes from the MCP server
    try {
      const settingsPath = join(app.getPath('userData'), 'settings.json')
      const content = await readFile(settingsPath, 'utf-8')
      const settings = JSON.parse(content)
      if (Array.isArray(settings.recentDecks)) {
        recentDecks = settings.recentDecks.map((d: string | RecentDeck) =>
          typeof d === 'string'
            ? { path: d, title: d.split('/').pop()?.replace(/^lecta-workspace-/, '').replace(/-[A-Za-z0-9]{6,}$/, '').replace(/-/g, ' ') || d, date: '' }
            : d
        )
      }
    } catch { /* no saved recents */ }

    return recentDecks
  })
}

/** Helper to load all slides for a parsed presentation config. Every YAML path is confined to the deck. */
async function loadAllSlides(config: Presentation, rootPath: string): Promise<LoadedSlide[]> {
  return Promise.all(
    config.slides.map(async (slideConfig) => {
      const markdownPath = resolveInsideDeck(rootPath, slideConfig.content)
      const markdownContent = await readFile(markdownPath, 'utf-8')

      let codeContent: string | null = null
      if (slideConfig.code) {
        const codePath = resolveInsideDeck(rootPath, slideConfig.code.file)
        codeContent = await readFile(codePath, 'utf-8')
      }

      let notesContent: string | null = null
      if (slideConfig.notes) {
        let notesPath: string | null = null
        try {
          notesPath = resolveInsideDeck(rootPath, slideConfig.notes)
        } catch {
          // Do not swallow traversal: skip these notes and say so
          console.warn(`[file-system] Slide "${slideConfig.id}" notes path is outside the deck; ignoring: ${slideConfig.notes}`)
        }
        if (notesPath) {
          try {
            notesContent = await readFile(notesPath, 'utf-8')
          } catch {
            // Notes file doesn't exist yet
          }
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
}
