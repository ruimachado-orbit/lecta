import { ipcMain, dialog } from 'electron'
import { readFile, writeFile, mkdir, access, copyFile } from 'fs/promises'
import { join, basename, extname } from 'path'
import { stringify as stringifyYaml } from 'yaml'
import { parsePresentationYaml } from '../../../packages/shared/src/utils/yaml-parser'
import { resolveRelativePath, detectLanguage } from '../../../packages/shared/src/utils/path-resolver'
import { DECK_CONFIG_FILE } from '../../../packages/shared/src/constants'
import { startWatching } from '../services/file-watcher'
import { setAIDeckPath } from './ai'
import {
  openLectaFile,
  saveLectaFile,
  createLectaFile,
  registerWorkspace,
  autoSave
} from '../services/lecta-file'
import { importPptx } from '../services/pptx-importer'
import type {
  LoadedPresentation,
  LoadedSlide,
  Presentation,
  SlideConfig,
  SupportedLanguage,
  ExecutionEngine
} from '../../../packages/shared/src/types/presentation'

let recentDecks: string[] = []

async function getSettingsPath(): Promise<string> {
  const { app } = await import('electron')
  return join(app.getPath('userData'), 'settings.json')
}

async function persistRecentDecks(): Promise<void> {
  try {
    const settingsPath = await getSettingsPath()
    let settings: Record<string, unknown> = {}
    try {
      const content = await readFile(settingsPath, 'utf-8')
      settings = JSON.parse(content)
    } catch { /* fresh settings */ }
    settings.recentDecks = recentDecks
    const { app } = await import('electron')
    await mkdir(app.getPath('userData'), { recursive: true })
    await writeFile(settingsPath, JSON.stringify(settings, null, 2))
  } catch {
    // Non-critical, ignore
  }
}

/** Write the current presentation config back to lecta.yaml */
async function savePresentationYaml(presentation: Presentation): Promise<void> {
  const configPath = join(presentation.rootPath, DECK_CONFIG_FILE)

  // Build a clean object without rootPath for serialization
  const toSerialize: Record<string, unknown> = {
    title: presentation.title,
    author: presentation.author,
    theme: presentation.theme,
    slides: presentation.slides.map((s) => {
      const slide: Record<string, unknown> = {
        id: s.id,
        content: s.content,
      }
      if (s.code) slide.code = s.code
      if (s.video) slide.video = s.video
      if (s.webapp) slide.webapp = s.webapp
      slide.artifacts = s.artifacts
      if (s.notes) slide.notes = s.notes
      if (s.transition && s.transition !== 'none') slide.transition = s.transition
      return slide
    })
  }
  if (presentation.ai) toSerialize.ai = presentation.ai
  if (presentation.groups && presentation.groups.length > 0) toSerialize.groups = presentation.groups

  await writeFile(configPath, stringifyYaml(toSerialize, { lineWidth: 120 }), 'utf-8')

  // Auto-save to .lecta file if workspace is from one
  await autoSave(presentation.rootPath)
}

const LANGUAGE_TO_ENGINE: Partial<Record<SupportedLanguage, ExecutionEngine>> = {
  javascript: 'sandpack',
  typescript: 'sandpack',
  python: 'pyodide',
  sql: 'sql'
}

export function registerFileSystemHandlers(): void {
  // Open a folder, .lecta file, or .pptx file
  ipcMain.handle('fs:open-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'openFile'],
      filters: [
        { name: 'Lecta Presentations', extensions: ['lecta'] },
        { name: 'PowerPoint', extensions: ['pptx'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      title: 'Open Presentation'
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

    // Regular folder
    return selected
  })

  // Create a new .lecta file
  ipcMain.handle('fs:create-lecta-file', async (_event, name: string): Promise<string | null> => {
    const result = await dialog.showSaveDialog({
      title: 'Create New Presentation',
      defaultPath: `${name}.lecta`,
      filters: [{ name: 'Lecta Presentation', extensions: ['lecta'] }]
    })

    if (result.canceled || !result.filePath) {
      return null
    }

    const lectaFilePath = result.filePath
    const workspaceDir = await createLectaFile(lectaFilePath, name)
    registerWorkspace(workspaceDir, lectaFilePath)
    return workspaceDir
  })

  // Save workspace back to .lecta file explicitly
  ipcMain.handle('fs:save-lecta', async (_event, rootPath: string): Promise<void> => {
    await autoSave(rootPath)
  })

  ipcMain.handle('fs:load-presentation', async (_event, folderPath: string): Promise<LoadedPresentation> => {
    const configPath = join(folderPath, DECK_CONFIG_FILE)

    try {
      await access(configPath)
    } catch {
      throw new Error(`No ${DECK_CONFIG_FILE} found in ${folderPath}`)
    }

    const yamlContent = await readFile(configPath, 'utf-8')
    const config = parsePresentationYaml(yamlContent, folderPath)

    // Load all slide content
    const slides: LoadedSlide[] = await Promise.all(
      config.slides.map(async (slideConfig) => {
        const markdownPath = resolveRelativePath(folderPath, slideConfig.content)
        const markdownContent = await readFile(markdownPath, 'utf-8')

        let codeContent: string | null = null
        if (slideConfig.code) {
          const codePath = resolveRelativePath(folderPath, slideConfig.code.file)
          codeContent = await readFile(codePath, 'utf-8')
        }

        let notesContent: string | null = null
        if (slideConfig.notes) {
          try {
            const notesPath = resolveRelativePath(folderPath, slideConfig.notes)
            notesContent = await readFile(notesPath, 'utf-8')
          } catch {
            // Notes file doesn't exist yet, that's fine
          }
        }

        return {
          config: slideConfig,
          markdownContent,
          codeContent,
          codeLanguage: slideConfig.code?.language ?? null,
          notesContent
        }
      })
    )

    // Track recent decks and set AI deck path
    recentDecks = [folderPath, ...recentDecks.filter((d) => d !== folderPath)].slice(0, 10)
    await persistRecentDecks()
    await setAIDeckPath(folderPath)

    // Start watching code files for changes
    const codeFiles = config.slides
      .filter((s) => s.code)
      .map((s) => resolveRelativePath(folderPath, s.code!.file))
    startWatching(codeFiles)

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
    const projectDir = join(parentDir, name)

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
    const yaml = [
      `title: "${name}"`,
      `author: ""`,
      `theme: "dark"`,
      ``,
      `slides:`,
      `  - id: welcome`,
      `    content: slides/01-welcome.md`,
      `    artifacts: []`,
      ``
    ].join('\n')

    await writeFile(join(projectDir, DECK_CONFIG_FILE), yaml, 'utf-8')

    return projectDir
  })

  // Add a new slide to the presentation
  ipcMain.handle(
    'fs:add-slide',
    async (_event, rootPath: string, slideId: string, afterIndex: number): Promise<LoadedPresentation> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parsePresentationYaml(yamlContent, rootPath)

      // Determine slide number for file naming
      const slideNum = String(config.slides.length + 1).padStart(2, '0')
      const contentPath = `slides/${slideNum}-${slideId}.md`

      // Create the markdown file
      await mkdir(join(rootPath, 'slides'), { recursive: true })
      await writeFile(
        join(rootPath, contentPath),
        `# ${slideId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}\n\n`,
        'utf-8'
      )

      // Insert new slide config
      const newSlide: SlideConfig = {
        id: slideId,
        content: contentPath,
        artifacts: []
      }
      config.slides.splice(afterIndex + 1, 0, newSlide)

      // Save and reload
      await savePresentationYaml(config)

      // Re-invoke load to get the full LoadedPresentation
      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parsePresentationYaml(reloaded, rootPath)
      const slides = await loadAllSlides(reloadedConfig, rootPath)
      return { config: reloadedConfig, slides }
    }
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
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parsePresentationYaml(yamlContent, rootPath)

      const slide = config.slides[slideIndex]
      if (!slide) throw new Error(`Slide at index ${slideIndex} not found`)
      if (slide.code) throw new Error('Slide already has code attached')

      // Determine file extension
      const extMap: Partial<Record<SupportedLanguage, string>> = {
        javascript: '.js', typescript: '.ts', python: '.py', sql: '.sql',
        html: '.html', css: '.css', json: '.json', bash: '.sh',
        rust: '.rs', go: '.go', java: '.java', csharp: '.cs', ruby: '.rb', php: '.php',
        markdown: '.md'
      }
      const ext = extMap[language] || '.txt'
      const codeFile = `code/${slide.id}${ext}`

      // Create the code file
      await mkdir(join(rootPath, 'code'), { recursive: true })
      await writeFile(join(rootPath, codeFile), '', 'utf-8')

      // Update slide config
      const engine = LANGUAGE_TO_ENGINE[language] || 'native'
      slide.code = {
        file: codeFile,
        language,
        execution: engine
      }
      if (engine === 'native') {
        const cmdMap: Partial<Record<SupportedLanguage, string>> = {
          javascript: 'node', bash: 'bash', python: 'python3',
          rust: 'rustc', go: 'go', ruby: 'ruby', php: 'php'
        }
        slide.code.command = cmdMap[language] || language
        slide.code.args = [codeFile]
      }

      await savePresentationYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parsePresentationYaml(reloaded, rootPath)
      const slides = await loadAllSlides(reloadedConfig, rootPath)
      return { config: reloadedConfig, slides }
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

      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parsePresentationYaml(yamlContent, rootPath)

      const slide = config.slides[slideIndex]
      if (!slide) throw new Error(`Slide at index ${slideIndex} not found`)

      // Copy each file into artifacts/ folder and add to config
      await mkdir(join(rootPath, 'artifacts'), { recursive: true })
      for (const filePath of result.filePaths) {
        const fileName = basename(filePath)
        const destPath = join(rootPath, 'artifacts', fileName)
        await copyFile(filePath, destPath)

        const label = fileName.replace(extname(fileName), '')
        slide.artifacts.push({
          path: `artifacts/${fileName}`,
          label
        })
      }

      await savePresentationYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parsePresentationYaml(reloaded, rootPath)
      const slides = await loadAllSlides(reloadedConfig, rootPath)
      return { config: reloadedConfig, slides }
    }
  )

  // Add a video to a slide
  ipcMain.handle(
    'fs:add-video',
    async (_event, rootPath: string, slideIndex: number, url: string, label?: string): Promise<LoadedPresentation> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parsePresentationYaml(yamlContent, rootPath)

      const slide = config.slides[slideIndex]
      if (!slide) throw new Error(`Slide at index ${slideIndex} not found`)

      slide.video = { url, label }

      await savePresentationYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parsePresentationYaml(reloaded, rootPath)
      const slides = await loadAllSlides(reloadedConfig, rootPath)
      return { config: reloadedConfig, slides }
    }
  )

  // Add a webapp to a slide
  ipcMain.handle(
    'fs:add-webapp',
    async (_event, rootPath: string, slideIndex: number, url: string, label?: string): Promise<LoadedPresentation> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parsePresentationYaml(yamlContent, rootPath)

      const slide = config.slides[slideIndex]
      if (!slide) throw new Error(`Slide at index ${slideIndex} not found`)

      slide.webapp = { url, label }

      await savePresentationYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parsePresentationYaml(reloaded, rootPath)
      const slides = await loadAllSlides(reloadedConfig, rootPath)
      return { config: reloadedConfig, slides }
    }
  )

  // Add multiple slides at once (for AI bulk generation)
  ipcMain.handle(
    'fs:add-bulk-slides',
    async (
      _event,
      rootPath: string,
      slides: { id: string; markdown: string }[],
      afterIndex: number
    ): Promise<LoadedPresentation> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parsePresentationYaml(yamlContent, rootPath)

      await mkdir(join(rootPath, 'slides'), { recursive: true })

      const newConfigs: SlideConfig[] = []
      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i]
        const slideNum = String(config.slides.length + i + 1).padStart(2, '0')
        const contentPath = `slides/${slideNum}-${slide.id}.md`

        await writeFile(join(rootPath, contentPath), slide.markdown, 'utf-8')

        newConfigs.push({
          id: slide.id,
          content: contentPath,
          artifacts: []
        })
      }

      // Insert after the specified index
      config.slides.splice(afterIndex + 1, 0, ...newConfigs)

      await savePresentationYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parsePresentationYaml(reloaded, rootPath)
      const loadedSlides = await loadAllSlides(reloadedConfig, rootPath)
      return { config: reloadedConfig, slides: loadedSlides }
    }
  )

  // Delete a slide
  ipcMain.handle(
    'fs:delete-slide',
    async (_event, rootPath: string, slideIndex: number): Promise<LoadedPresentation> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parsePresentationYaml(yamlContent, rootPath)

      if (config.slides.length <= 1) throw new Error('Cannot delete the last slide')

      config.slides.splice(slideIndex, 1)
      await savePresentationYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parsePresentationYaml(reloaded, rootPath)
      const slides = await loadAllSlides(reloadedConfig, rootPath)
      return { config: reloadedConfig, slides }
    }
  )

  // Rename a slide
  ipcMain.handle(
    'fs:rename-slide',
    async (_event, rootPath: string, slideIndex: number, newId: string): Promise<LoadedPresentation> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parsePresentationYaml(yamlContent, rootPath)

      const slide = config.slides[slideIndex]
      if (!slide) throw new Error(`Slide at index ${slideIndex} not found`)

      slide.id = newId

      await savePresentationYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parsePresentationYaml(reloaded, rootPath)
      const slides = await loadAllSlides(reloadedConfig, rootPath)
      return { config: reloadedConfig, slides }
    }
  )

  // Reorder slides
  ipcMain.handle(
    'fs:reorder-slide',
    async (_event, rootPath: string, fromIndex: number, toIndex: number): Promise<LoadedPresentation> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parsePresentationYaml(yamlContent, rootPath)

      const [moved] = config.slides.splice(fromIndex, 1)
      config.slides.splice(toIndex, 0, moved)

      await savePresentationYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parsePresentationYaml(reloaded, rootPath)
      const slides = await loadAllSlides(reloadedConfig, rootPath)
      return { config: reloadedConfig, slides }
    }
  )

  // Save notes content for a slide (creates file + updates YAML if needed)
  ipcMain.handle(
    'fs:save-notes',
    async (_event, rootPath: string, slideIndex: number, content: string): Promise<string> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parsePresentationYaml(yamlContent, rootPath)

      const slide = config.slides[slideIndex]
      if (!slide) throw new Error(`Slide at index ${slideIndex} not found`)

      // Create notes file path if not already set
      if (!slide.notes) {
        const notesPath = `slides/${slide.id}.notes.md`
        slide.notes = notesPath
        await savePresentationYaml(config)
      }

      // Write notes content to file
      const notesFullPath = join(rootPath, slide.notes)
      await mkdir(join(rootPath, 'slides'), { recursive: true })
      await writeFile(notesFullPath, content, 'utf-8')

      // Auto-save to .lecta
      await autoSave(rootPath)

      return slide.notes
    }
  )

  // Save slide groups
  ipcMain.handle(
    'fs:save-groups',
    async (_event, rootPath: string, groups: { id: string; name: string; slideIds: string[] }[]): Promise<void> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parsePresentationYaml(yamlContent, rootPath)
      config.groups = groups
      await savePresentationYaml(config)
    }
  )

  // Set slide transition direction
  ipcMain.handle(
    'fs:set-transition',
    async (_event, rootPath: string, slideIndex: number, transition: string): Promise<LoadedPresentation> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parsePresentationYaml(yamlContent, rootPath)

      const slide = config.slides[slideIndex]
      if (!slide) throw new Error(`Slide at index ${slideIndex} not found`)

      slide.transition = transition as any
      await savePresentationYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parsePresentationYaml(reloaded, rootPath)
      const slides = await loadAllSlides(reloadedConfig, rootPath)
      return { config: reloadedConfig, slides }
    }
  )

  // Remove an attachment (code, video, webapp, or file artifact) from a slide
  ipcMain.handle(
    'fs:remove-attachment',
    async (
      _event,
      rootPath: string,
      slideIndex: number,
      type: 'code' | 'video' | 'webapp' | 'artifact',
      artifactIndex?: number
    ): Promise<LoadedPresentation> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parsePresentationYaml(yamlContent, rootPath)

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
        case 'artifact':
          if (typeof artifactIndex === 'number') {
            slide.artifacts.splice(artifactIndex, 1)
          }
          break
      }

      await savePresentationYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parsePresentationYaml(reloaded, rootPath)
      const slides = await loadAllSlides(reloadedConfig, rootPath)
      return { config: reloadedConfig, slides }
    }
  )

  ipcMain.handle('fs:read-file', async (_event, filePath: string): Promise<string> => {
    return readFile(filePath, 'utf-8')
  })

  ipcMain.handle('fs:write-file', async (_event, filePath: string, content: string): Promise<void> => {
    await writeFile(filePath, content, 'utf-8')
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

      const srcPath = result.filePaths[0]
      const fileName = basename(srcPath)
      const imagesDir = join(rootPath, 'images')
      await mkdir(imagesDir, { recursive: true })

      // Avoid name collisions
      const destName = `${Date.now()}-${fileName}`
      await copyFile(srcPath, join(imagesDir, destName))

      // Auto-save to .lecta if applicable
      await autoSave(rootPath)

      return `images/${destName}`
    }
  )

  ipcMain.handle('fs:get-recent-decks', async (): Promise<string[]> => {
    if (recentDecks.length === 0) {
      // Load from persisted settings on first access
      try {
        const { app } = await import('electron')
        const settingsPath = join(app.getPath('userData'), 'settings.json')
        const content = await readFile(settingsPath, 'utf-8')
        const settings = JSON.parse(content)
        if (Array.isArray(settings.recentDecks)) {
          recentDecks = settings.recentDecks
        }
      } catch { /* no saved recents */ }
    }
    return recentDecks
  })
}

/** Helper to load all slides for a parsed presentation config */
async function loadAllSlides(config: Presentation, rootPath: string): Promise<LoadedSlide[]> {
  return Promise.all(
    config.slides.map(async (slideConfig) => {
      const markdownPath = resolveRelativePath(rootPath, slideConfig.content)
      const markdownContent = await readFile(markdownPath, 'utf-8')

      let codeContent: string | null = null
      if (slideConfig.code) {
        const codePath = resolveRelativePath(rootPath, slideConfig.code.file)
        codeContent = await readFile(codePath, 'utf-8')
      }

      let notesContent: string | null = null
      if (slideConfig.notes) {
        try {
          const notesPath = resolveRelativePath(rootPath, slideConfig.notes)
          notesContent = await readFile(notesPath, 'utf-8')
        } catch {
          // Notes file doesn't exist yet
        }
      }

      return {
        config: slideConfig,
        markdownContent,
        codeContent,
        codeLanguage: slideConfig.code?.language ?? null,
        notesContent
      }
    })
  )
}
