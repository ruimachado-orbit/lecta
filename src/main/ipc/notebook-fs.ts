import { ipcMain } from 'electron'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { stringify as stringifyYaml } from 'yaml'
import { parseNotebookYaml } from '../../../packages/shared/src/utils/notebook-parser'
import { resolveRelativePath } from '../../../packages/shared/src/utils/path-resolver'
import { DECK_CONFIG_FILE } from '../../../packages/shared/src/constants'
import { autoSave } from '../services/lecta-file'
import { addRecentItem } from './file-system'
import type {
  LoadedNote,
  LoadedNotebook,
  Notebook,
  NoteConfig,
  NoteLayout,
  CellType,
  CellOutput,
  NotebookKernel
} from '../../../packages/shared/src/types/notebook'
import type { SupportedLanguage, ExecutionEngine } from '../../../packages/shared/src/types/presentation'

/** Map a kernel name to language, execution engine, and file extension */
function kernelToCodeConfig(kernel: NotebookKernel | undefined): {
  language: SupportedLanguage; execution: ExecutionEngine; ext: string
} {
  switch (kernel) {
    case 'javascript': return { language: 'javascript', execution: 'sandpack', ext: '.js' }
    case 'typescript': return { language: 'typescript', execution: 'sandpack', ext: '.ts' }
    case 'sql':        return { language: 'sql', execution: 'sql', ext: '.sql' }
    case 'bash':       return { language: 'bash', execution: 'native', ext: '.sh' }
    case 'go':         return { language: 'go', execution: 'native', ext: '.go' }
    case 'rust':       return { language: 'rust', execution: 'native', ext: '.rs' }
    case 'python':
    default:           return { language: 'python', execution: 'pyodide', ext: '.py' }
  }
}

/** Write the notebook config back to lecta.yaml */
async function saveNotebookYaml(notebook: Notebook): Promise<void> {
  const configPath = join(notebook.rootPath, DECK_CONFIG_FILE)

  const serializeNote = (n: NoteConfig): Record<string, unknown> => {
    const note: Record<string, unknown> = {
      id: n.id,
      content: n.content,
      createdAt: n.createdAt
    }
    if (n.layout) note.layout = n.layout
    if (n.archivedAt) note.archivedAt = n.archivedAt
    if (n.code) note.code = n.code
    if (n.video) note.video = n.video
    if (n.webapp) note.webapp = n.webapp
    if (n.cellType) note.cellType = n.cellType
    if (n.cellIndex != null) note.cellIndex = n.cellIndex
    if (n.outputs && n.outputs.length > 0) note.outputs = n.outputs
    note.artifacts = n.artifacts
    if (n.children && n.children.length > 0) {
      note.children = n.children.map(serializeNote)
    }
    return note
  }

  const toSerialize: Record<string, unknown> = {
    type: 'notebook',
    title: notebook.title,
    author: notebook.author,
    theme: notebook.theme,
    defaultLayout: notebook.defaultLayout,
    ...(notebook.sourceFormat ? { sourceFormat: notebook.sourceFormat } : {}),
    ...(notebook.kernel ? { kernel: notebook.kernel } : {}),
    ...(notebook.lastViewedIndex != null && notebook.lastViewedIndex > 0 ? { lastViewedIndex: notebook.lastViewedIndex } : {}),
    pages: notebook.pages.map(serializeNote)
  }

  await writeFile(configPath, stringifyYaml(toSerialize, { lineWidth: 120 }), 'utf-8')
  await autoSave(notebook.rootPath)
}

/** Recursively load a note and its children */
async function loadNote(noteConfig: NoteConfig, rootPath: string, depth: number): Promise<LoadedNote> {
  const mdPath = resolveRelativePath(rootPath, noteConfig.content)
  let markdownContent = ''
  try {
    markdownContent = await readFile(mdPath, 'utf-8')
  } catch {
    // File doesn't exist yet — create it
    await mkdir(join(rootPath, 'pages'), { recursive: true })
    await writeFile(mdPath, '', 'utf-8')
  }

  let codeContent: string | null = null
  if (noteConfig.code) {
    const codePath = resolveRelativePath(rootPath, noteConfig.code.file)
    try {
      codeContent = await readFile(codePath, 'utf-8')
    } catch {
      codeContent = ''
    }
  }

  const children: LoadedNote[] = []
  if (noteConfig.children) {
    for (const child of noteConfig.children) {
      children.push(await loadNote(child, rootPath, depth + 1))
    }
  }

  return {
    config: noteConfig,
    markdownContent,
    codeContent,
    codeLanguage: noteConfig.code?.language ?? null,
    children,
    depth
  }
}

/** Flatten notes tree in DFS order for easy indexing */
function flattenNotes(notes: LoadedNote[]): LoadedNote[] {
  const result: LoadedNote[] = []
  for (const note of notes) {
    result.push(note)
    if (note.children.length > 0) {
      result.push(...flattenNotes(note.children))
    }
  }
  return result
}

/** Load all notes for a notebook */
async function loadAllNotes(config: Notebook): Promise<LoadedNote[]> {
  const tree: LoadedNote[] = []
  for (const page of config.pages) {
    tree.push(await loadNote(page, config.rootPath, 0))
  }
  return flattenNotes(tree)
}

export function registerNotebookHandlers(): void {
  // Load a notebook
  ipcMain.handle('nb:load', async (_event, folderPath: string): Promise<LoadedNotebook> => {
    const configPath = join(folderPath, DECK_CONFIG_FILE)
    const yamlContent = await readFile(configPath, 'utf-8')
    const config = parseNotebookYaml(yamlContent, folderPath)
    const pages = await loadAllNotes(config)

    // Track in recent items
    const firstPage = pages[0]
    const preview = firstPage?.markdownContent
      ?.replace(/<!--.*?-->/gs, '').replace(/<[^>]+>/g, '')
      .trim().split('\n').filter((l: string) => l.trim()).slice(0, 5).join('\n') || ''
    await addRecentItem({
      path: folderPath,
      title: config.title,
      type: 'notebook',
      slideCount: pages.length,
      firstSlidePreview: preview.slice(0, 200),
      artifacts: []
    })

    return { config, pages }
  })

  // Add a new note (top-level, with today's date)
  ipcMain.handle(
    'nb:add-note',
    async (_event, rootPath: string, noteId: string, afterIndex: number): Promise<LoadedNotebook> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parseNotebookYaml(yamlContent, rootPath)

      const contentPath = `pages/${noteId}.md`
      await mkdir(join(rootPath, 'pages'), { recursive: true })
      await writeFile(join(rootPath, contentPath), `# ${noteId.replace(/-/g, ' ')}\n\n`, 'utf-8')

      const newNote: NoteConfig = {
        id: noteId,
        content: contentPath,
        createdAt: new Date().toISOString(),
        artifacts: []
      }

      // Insert after the specified index (top-level only for now)
      config.pages.splice(afterIndex + 1, 0, newNote)
      await saveNotebookYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parseNotebookYaml(reloaded, rootPath)
      const pages = await loadAllNotes(reloadedConfig)
      return { config: reloadedConfig, pages }
    }
  )

  // Add a subnote under a parent
  ipcMain.handle(
    'nb:add-subnote',
    async (_event, rootPath: string, parentId: string, noteId: string): Promise<LoadedNotebook> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parseNotebookYaml(yamlContent, rootPath)

      const contentPath = `pages/${noteId}.md`
      const title = noteId.replace(/^note-\d+$/, 'Untitled').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      await mkdir(join(rootPath, 'pages'), { recursive: true })
      await writeFile(join(rootPath, contentPath), `## ${title}\n\n`, 'utf-8')

      const newNote: NoteConfig = {
        id: noteId,
        content: contentPath,
        createdAt: new Date().toISOString(),
        artifacts: []
      }

      // Find parent in tree and add child
      function addChild(notes: NoteConfig[]): boolean {
        for (const note of notes) {
          if (note.id === parentId) {
            if (!note.children) note.children = []
            note.children.push(newNote)
            return true
          }
          if (note.children && addChild(note.children)) return true
        }
        return false
      }

      addChild(config.pages)
      await saveNotebookYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parseNotebookYaml(reloaded, rootPath)
      const pages = await loadAllNotes(reloadedConfig)
      return { config: reloadedConfig, pages }
    }
  )

  // Delete a note (and all children)
  ipcMain.handle(
    'nb:delete-note',
    async (_event, rootPath: string, noteId: string): Promise<LoadedNotebook> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parseNotebookYaml(yamlContent, rootPath)

      function removeNote(notes: NoteConfig[]): NoteConfig[] {
        return notes.filter((n) => {
          if (n.id === noteId) return false
          if (n.children) n.children = removeNote(n.children)
          return true
        })
      }

      config.pages = removeNote(config.pages)
      await saveNotebookYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parseNotebookYaml(reloaded, rootPath)
      const pages = await loadAllNotes(reloadedConfig)
      return { config: reloadedConfig, pages }
    }
  )

  // Set note layout
  ipcMain.handle(
    'nb:set-layout',
    async (_event, rootPath: string, noteId: string, layout: string): Promise<LoadedNotebook> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parseNotebookYaml(yamlContent, rootPath)

      function setLayout(notes: NoteConfig[]): boolean {
        for (const note of notes) {
          if (note.id === noteId) {
            note.layout = layout as NoteLayout
            return true
          }
          if (note.children && setLayout(note.children)) return true
        }
        return false
      }

      setLayout(config.pages)
      await saveNotebookYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parseNotebookYaml(reloaded, rootPath)
      const pages = await loadAllNotes(reloadedConfig)
      return { config: reloadedConfig, pages }
    }
  )

  // Rename a note
  ipcMain.handle(
    'nb:rename-note',
    async (_event, rootPath: string, noteId: string, newId: string): Promise<LoadedNotebook> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parseNotebookYaml(yamlContent, rootPath)

      function rename(notes: NoteConfig[]): boolean {
        for (const note of notes) {
          if (note.id === noteId) { note.id = newId; return true }
          if (note.children && rename(note.children)) return true
        }
        return false
      }

      rename(config.pages)
      await saveNotebookYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parseNotebookYaml(reloaded, rootPath)
      const pages = await loadAllNotes(reloadedConfig)
      return { config: reloadedConfig, pages }
    }
  )

  // Archive a note (set archivedAt timestamp)
  ipcMain.handle(
    'nb:archive-note',
    async (_event, rootPath: string, noteId: string): Promise<LoadedNotebook> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parseNotebookYaml(yamlContent, rootPath)

      function archiveNote(notes: NoteConfig[]): boolean {
        for (const note of notes) {
          if (note.id === noteId) {
            note.archivedAt = new Date().toISOString()
            return true
          }
          if (note.children && archiveNote(note.children)) return true
        }
        return false
      }

      archiveNote(config.pages)
      await saveNotebookYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parseNotebookYaml(reloaded, rootPath)
      const pages = await loadAllNotes(reloadedConfig)
      return { config: reloadedConfig, pages }
    }
  )

  // Unarchive a note (remove archivedAt)
  ipcMain.handle(
    'nb:unarchive-note',
    async (_event, rootPath: string, noteId: string): Promise<LoadedNotebook> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parseNotebookYaml(yamlContent, rootPath)

      function unarchive(notes: NoteConfig[]): boolean {
        for (const note of notes) {
          if (note.id === noteId) {
            delete note.archivedAt
            return true
          }
          if (note.children && unarchive(note.children)) return true
        }
        return false
      }

      unarchive(config.pages)
      await saveNotebookYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parseNotebookYaml(reloaded, rootPath)
      const pages = await loadAllNotes(reloadedConfig)
      return { config: reloadedConfig, pages }
    }
  )

  // Add code to a note
  ipcMain.handle(
    'nb:add-code',
    async (_event, rootPath: string, noteId: string, language: string): Promise<LoadedNotebook> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parseNotebookYaml(yamlContent, rootPath)

      const extMap: Record<string, string> = {
        javascript: '.js', typescript: '.ts', python: '.py', sql: '.sql',
        html: '.html', css: '.css', json: '.json', bash: '.sh',
        rust: '.rs', go: '.go', markdown: '.md'
      }
      const ext = extMap[language] || '.txt'
      const codeFile = `code/${noteId}${ext}`

      await mkdir(join(rootPath, 'code'), { recursive: true })
      await writeFile(join(rootPath, codeFile), '', 'utf-8')

      const engineMap: Record<string, string> = {
        javascript: 'sandpack', typescript: 'sandpack', python: 'pyodide', sql: 'sql'
      }

      function addCode(notes: NoteConfig[]): boolean {
        for (const note of notes) {
          if (note.id === noteId) {
            note.code = {
              file: codeFile,
              language: language as any,
              execution: (engineMap[language] || 'none') as any
            }
            return true
          }
          if (note.children && addCode(note.children)) return true
        }
        return false
      }

      addCode(config.pages)
      await saveNotebookYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parseNotebookYaml(reloaded, rootPath)
      const pages = await loadAllNotes(reloadedConfig)
      return { config: reloadedConfig, pages }
    }
  )

  // Add video to a note
  ipcMain.handle(
    'nb:add-video',
    async (_event, rootPath: string, noteId: string, url: string): Promise<LoadedNotebook> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parseNotebookYaml(yamlContent, rootPath)

      function addVid(notes: NoteConfig[]): boolean {
        for (const note of notes) {
          if (note.id === noteId) { (note as any).video = { url }; return true }
          if (note.children && addVid(note.children)) return true
        }
        return false
      }

      addVid(config.pages)
      await saveNotebookYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parseNotebookYaml(reloaded, rootPath)
      const pages = await loadAllNotes(reloadedConfig)
      return { config: reloadedConfig, pages }
    }
  )

  // Add webapp to a note
  ipcMain.handle(
    'nb:add-webapp',
    async (_event, rootPath: string, noteId: string, url: string): Promise<LoadedNotebook> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parseNotebookYaml(yamlContent, rootPath)

      function addWeb(notes: NoteConfig[]): boolean {
        for (const note of notes) {
          if (note.id === noteId) { (note as any).webapp = { url }; return true }
          if (note.children && addWeb(note.children)) return true
        }
        return false
      }

      addWeb(config.pages)
      await saveNotebookYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parseNotebookYaml(reloaded, rootPath)
      const pages = await loadAllNotes(reloadedConfig)
      return { config: reloadedConfig, pages }
    }
  )

  // Set notebook default layout (persists to YAML)
  ipcMain.handle(
    'nb:set-default-layout',
    async (_event, rootPath: string, layout: string): Promise<LoadedNotebook> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parseNotebookYaml(yamlContent, rootPath)

      config.defaultLayout = layout as NoteLayout
      await saveNotebookYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parseNotebookYaml(reloaded, rootPath)
      const pages = await loadAllNotes(reloadedConfig)
      return { config: reloadedConfig, pages }
    }
  )

  // Set notebook kernel (persists to YAML)
  ipcMain.handle(
    'nb:set-kernel',
    async (_event, rootPath: string, kernel: string): Promise<LoadedNotebook> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parseNotebookYaml(yamlContent, rootPath)

      config.kernel = kernel as any
      await saveNotebookYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parseNotebookYaml(reloaded, rootPath)
      const pages = await loadAllNotes(reloadedConfig)
      return { config: reloadedConfig, pages }
    }
  )

  // Save note content (write markdown to disk + autoSave)
  ipcMain.handle(
    'nb:save-content',
    async (_event, rootPath: string, contentPath: string, content: string): Promise<void> => {
      const fullPath = join(rootPath, contentPath)
      await writeFile(fullPath, content, 'utf-8')
      await autoSave(rootPath)
    }
  )

  // Reorder a note (move from one index to another in the top-level pages array)
  ipcMain.handle(
    'nb:reorder-note',
    async (_event, rootPath: string, fromIndex: number, toIndex: number): Promise<LoadedNotebook> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parseNotebookYaml(yamlContent, rootPath)

      if (fromIndex < 0 || fromIndex >= config.pages.length || toIndex < 0 || toIndex >= config.pages.length) {
        throw new Error(`Invalid reorder indices: ${fromIndex} -> ${toIndex}`)
      }

      const [moved] = config.pages.splice(fromIndex, 1)
      config.pages.splice(toIndex, 0, moved)

      // Update cellIndex values to reflect new order
      config.pages.forEach((page, i) => {
        if (page.cellIndex != null) page.cellIndex = i
      })

      await saveNotebookYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parseNotebookYaml(reloaded, rootPath)
      const pages = await loadAllNotes(reloadedConfig)
      return { config: reloadedConfig, pages }
    }
  )

  // Update cell outputs
  ipcMain.handle(
    'nb:update-outputs',
    async (_event, rootPath: string, noteId: string, outputs: CellOutput[]): Promise<LoadedNotebook> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parseNotebookYaml(yamlContent, rootPath)

      function updateOutputs(notes: NoteConfig[]): boolean {
        for (const note of notes) {
          if (note.id === noteId) {
            note.outputs = outputs
            return true
          }
          if (note.children && updateOutputs(note.children)) return true
        }
        return false
      }

      updateOutputs(config.pages)
      await saveNotebookYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parseNotebookYaml(reloaded, rootPath)
      const pages = await loadAllNotes(reloadedConfig)
      return { config: reloadedConfig, pages }
    }
  )

  // Toggle cell type between markdown and code
  ipcMain.handle(
    'nb:toggle-cell-type',
    async (_event, rootPath: string, noteId: string): Promise<LoadedNotebook> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parseNotebookYaml(yamlContent, rootPath)

      function toggle(notes: NoteConfig[]): boolean {
        for (const note of notes) {
          if (note.id === noteId) {
            if (note.cellType === 'code') {
              // Switch to markdown — remove code block
              note.cellType = 'markdown'
              delete note.code
              note.outputs = undefined
            } else {
              // Switch to code — use the notebook's kernel language
              const kc = kernelToCodeConfig(config.kernel)
              note.cellType = 'code'
              const codeFile = `code/${noteId}${kc.ext}`
              note.code = {
                file: codeFile,
                language: kc.language,
                execution: kc.execution
              }
              // Create the code file if it doesn't exist
              const codePath = join(rootPath, codeFile)
              mkdir(join(rootPath, 'code'), { recursive: true })
                .then(() => writeFile(codePath, '', 'utf-8'))
                .catch(() => {})
            }
            return true
          }
          if (note.children && toggle(note.children)) return true
        }
        return false
      }

      toggle(config.pages)
      await saveNotebookYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parseNotebookYaml(reloaded, rootPath)
      const pages = await loadAllNotes(reloadedConfig)
      return { config: reloadedConfig, pages }
    }
  )

  // Add a cell after a given index (for Jupyter-style notebooks)
  ipcMain.handle(
    'nb:add-cell',
    async (_event, rootPath: string, afterIndex: number, cellType: CellType): Promise<LoadedNotebook> => {
      const configPath = join(rootPath, DECK_CONFIG_FILE)
      const yamlContent = await readFile(configPath, 'utf-8')
      const config = parseNotebookYaml(yamlContent, rootPath)

      const cellNum = String(config.pages.length + 1).padStart(2, '0')
      const cellId = `cell-${cellNum}`
      const mdPath = `pages/${cellId}.md`

      await mkdir(join(rootPath, 'pages'), { recursive: true })

      const newNote: NoteConfig = {
        id: cellId,
        content: mdPath,
        cellType,
        cellIndex: afterIndex + 1,
        createdAt: new Date().toISOString(),
        artifacts: []
      }

      if (cellType === 'code') {
        const kc = kernelToCodeConfig(config.kernel)
        const codeFile = `code/${cellId}${kc.ext}`
        await mkdir(join(rootPath, 'code'), { recursive: true })
        await writeFile(join(rootPath, codeFile), '', 'utf-8')
        await writeFile(join(rootPath, mdPath), `<!-- Code Cell -->\n`, 'utf-8')
        newNote.code = { file: codeFile, language: kc.language, execution: kc.execution }
      } else {
        await writeFile(join(rootPath, mdPath), '', 'utf-8')
      }

      config.pages.splice(afterIndex + 1, 0, newNote)

      // Re-index cells
      config.pages.forEach((page, i) => {
        if (page.cellIndex != null) page.cellIndex = i
      })

      await saveNotebookYaml(config)

      const reloaded = await readFile(configPath, 'utf-8')
      const reloadedConfig = parseNotebookYaml(reloaded, rootPath)
      const pages = await loadAllNotes(reloadedConfig)
      return { config: reloadedConfig, pages }
    }
  )
}
