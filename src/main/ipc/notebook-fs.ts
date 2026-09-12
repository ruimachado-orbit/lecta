import { ipcMain } from 'electron'
import { readFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { stringify as stringifyYaml } from 'yaml'
import { parseNotebookYaml } from '../../../packages/shared/src/utils/notebook-parser'
import { DECK_CONFIG_FILE } from '../../../packages/shared/src/constants'
import { autoSave } from '../services/lecta-file'
import { registerDeckRoot, assertInsideOpenDeck, resolveInsideDeck } from '../services/deck-roots'
import { atomicWriteFile, writeFileIfMissing, withLock } from '../services/safe-fs'
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

  await atomicWriteFile(configPath, stringifyYaml(toSerialize, { lineWidth: 120 }))
  await autoSave(notebook.rootPath)
}

/** Recursively load a note and its children */
async function loadNote(noteConfig: NoteConfig, rootPath: string, depth: number): Promise<LoadedNote> {
  let markdownContent = ''
  try {
    const mdPath = resolveInsideDeck(rootPath, noteConfig.content)
    try {
      markdownContent = await readFile(mdPath, 'utf-8')
    } catch {
      // File doesn't exist yet — create it (never truncate one that appeared meanwhile)
      await mkdir(dirname(mdPath), { recursive: true })
      await writeFileIfMissing(mdPath, '')
    }
  } catch (err) {
    // A content path that escapes the notebook is ignored, loudly
    console.warn(`[notebook-fs] Note "${noteConfig.id}" content path is outside the notebook; ignoring:`, err)
  }

  let codeContent: string | null = null
  if (noteConfig.code) {
    codeContent = ''
    try {
      codeContent = await readFile(resolveInsideDeck(rootPath, noteConfig.code.file), 'utf-8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`[notebook-fs] Note "${noteConfig.id}" code file unreadable:`, err)
      }
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

/** Read + parse lecta.yaml for the notebook at `root` (caller holds the lock). */
async function readNotebookConfig(root: string): Promise<Notebook> {
  const yamlContent = await readFile(join(root, DECK_CONFIG_FILE), 'utf-8')
  return parseNotebookYaml(yamlContent, root)
}

/**
 * Read → mutate → write lecta.yaml for an open notebook, serialized per root
 * and written atomically, then reload the notebook for the renderer.
 */
async function updateNotebook(
  rootPath: string,
  mutate: (config: Notebook, root: string) => void | Promise<void>
): Promise<LoadedNotebook> {
  const root = assertInsideOpenDeck(rootPath)
  return withLock(root, async () => {
    const config = await readNotebookConfig(root)
    await mutate(config, root)
    await saveNotebookYaml(config)

    const reloadedConfig = await readNotebookConfig(root)
    const pages = await loadAllNotes(reloadedConfig)
    return { config: reloadedConfig, pages }
  })
}

/** Create a content file under the notebook, never truncating an existing one. */
async function createContentFile(root: string, relativePath: string, content: string): Promise<void> {
  const abs = resolveInsideDeck(root, relativePath)
  await mkdir(dirname(abs), { recursive: true })
  await writeFileIfMissing(abs, content)
}

export function registerNotebookHandlers(): void {
  // Load a notebook
  ipcMain.handle('nb:load', async (_event, folderPath: string): Promise<LoadedNotebook> => {
    if (typeof folderPath !== 'string' || folderPath.length === 0) {
      throw new Error('No notebook path given')
    }
    const yamlContent = await readFile(join(folderPath, DECK_CONFIG_FILE), 'utf-8')
    const config = parseNotebookYaml(yamlContent, folderPath)

    // Only a notebook whose lecta.yaml parsed becomes readable via lecta-file:// and nb:*
    const root = registerDeckRoot(folderPath)
    const pages = await loadAllNotes(config)

    // Track in recent items
    const firstPage = pages[0]
    const preview = firstPage?.markdownContent
      ?.replace(/<!--.*?-->/gs, '').replace(/<[^>]+>/g, '')
      .trim().split('\n').filter((l: string) => l.trim()).slice(0, 5).join('\n') || ''
    await addRecentItem({
      path: root,
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
    async (_event, rootPath: string, noteId: string, afterIndex: number): Promise<LoadedNotebook> =>
      updateNotebook(rootPath, async (config, root) => {
        const contentPath = `pages/${noteId}.md`
        await createContentFile(root, contentPath, `# ${noteId.replace(/-/g, ' ')}\n\n`)

        const newNote: NoteConfig = {
          id: noteId,
          content: contentPath,
          createdAt: new Date().toISOString(),
          artifacts: []
        }

        // Insert after the specified index (top-level only for now)
        config.pages.splice(afterIndex + 1, 0, newNote)
      })
  )

  // Add a subnote under a parent
  ipcMain.handle(
    'nb:add-subnote',
    async (_event, rootPath: string, parentId: string, noteId: string): Promise<LoadedNotebook> =>
      updateNotebook(rootPath, async (config, root) => {
        const contentPath = `pages/${noteId}.md`
        const title = noteId.replace(/^note-\d+$/, 'Untitled').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        await createContentFile(root, contentPath, `## ${title}\n\n`)

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
      })
  )

  // Delete a note (and all children)
  ipcMain.handle(
    'nb:delete-note',
    async (_event, rootPath: string, noteId: string): Promise<LoadedNotebook> =>
      updateNotebook(rootPath, (config) => {
        function removeNote(notes: NoteConfig[]): NoteConfig[] {
          return notes.filter((n) => {
            if (n.id === noteId) return false
            if (n.children) n.children = removeNote(n.children)
            return true
          })
        }

        config.pages = removeNote(config.pages)
      })
  )

  // Set note layout
  ipcMain.handle(
    'nb:set-layout',
    async (_event, rootPath: string, noteId: string, layout: string): Promise<LoadedNotebook> =>
      updateNotebook(rootPath, (config) => {
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
      })
  )

  // Rename a note
  ipcMain.handle(
    'nb:rename-note',
    async (_event, rootPath: string, noteId: string, newId: string): Promise<LoadedNotebook> =>
      updateNotebook(rootPath, (config) => {
        function rename(notes: NoteConfig[]): boolean {
          for (const note of notes) {
            if (note.id === noteId) { note.id = newId; return true }
            if (note.children && rename(note.children)) return true
          }
          return false
        }

        rename(config.pages)
      })
  )

  // Archive a note (set archivedAt timestamp)
  ipcMain.handle(
    'nb:archive-note',
    async (_event, rootPath: string, noteId: string): Promise<LoadedNotebook> =>
      updateNotebook(rootPath, (config) => {
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
      })
  )

  // Unarchive a note (remove archivedAt)
  ipcMain.handle(
    'nb:unarchive-note',
    async (_event, rootPath: string, noteId: string): Promise<LoadedNotebook> =>
      updateNotebook(rootPath, (config) => {
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
      })
  )

  // Add code to a note
  ipcMain.handle(
    'nb:add-code',
    async (_event, rootPath: string, noteId: string, language: string): Promise<LoadedNotebook> =>
      updateNotebook(rootPath, async (config, root) => {
        const extMap: Record<string, string> = {
          javascript: '.js', typescript: '.ts', python: '.py', sql: '.sql',
          html: '.html', css: '.css', json: '.json', bash: '.sh',
          rust: '.rs', go: '.go', markdown: '.md'
        }
        const ext = extMap[language] || '.txt'
        const codeFile = `code/${noteId}${ext}`

        // Never truncate an existing code file
        await createContentFile(root, codeFile, '')

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
      })
  )

  // Add video to a note
  ipcMain.handle(
    'nb:add-video',
    async (_event, rootPath: string, noteId: string, url: string): Promise<LoadedNotebook> =>
      updateNotebook(rootPath, (config) => {
        function addVid(notes: NoteConfig[]): boolean {
          for (const note of notes) {
            if (note.id === noteId) { (note as any).video = { url }; return true }
            if (note.children && addVid(note.children)) return true
          }
          return false
        }

        addVid(config.pages)
      })
  )

  // Add webapp to a note
  ipcMain.handle(
    'nb:add-webapp',
    async (_event, rootPath: string, noteId: string, url: string): Promise<LoadedNotebook> =>
      updateNotebook(rootPath, (config) => {
        function addWeb(notes: NoteConfig[]): boolean {
          for (const note of notes) {
            if (note.id === noteId) { (note as any).webapp = { url }; return true }
            if (note.children && addWeb(note.children)) return true
          }
          return false
        }

        addWeb(config.pages)
      })
  )

  // Set notebook default layout (persists to YAML)
  ipcMain.handle(
    'nb:set-default-layout',
    async (_event, rootPath: string, layout: string): Promise<LoadedNotebook> =>
      updateNotebook(rootPath, (config) => {
        config.defaultLayout = layout as NoteLayout
      })
  )

  // Set notebook kernel (persists to YAML)
  ipcMain.handle(
    'nb:set-kernel',
    async (_event, rootPath: string, kernel: string): Promise<LoadedNotebook> =>
      updateNotebook(rootPath, (config) => {
        config.kernel = kernel as any
      })
  )

  // Save note content (write markdown to disk + autoSave)
  ipcMain.handle(
    'nb:save-content',
    async (_event, rootPath: string, contentPath: string, content: string): Promise<void> => {
      const root = assertInsideOpenDeck(rootPath)
      if (typeof content !== 'string') throw new Error('Note content must be a string')
      const fullPath = resolveInsideDeck(root, contentPath)
      await mkdir(dirname(fullPath), { recursive: true })
      await atomicWriteFile(fullPath, content)
      await autoSave(root)
    }
  )

  // Reorder a note (move from one index to another in the top-level pages array)
  ipcMain.handle(
    'nb:reorder-note',
    async (_event, rootPath: string, fromIndex: number, toIndex: number): Promise<LoadedNotebook> =>
      updateNotebook(rootPath, (config) => {
        if (fromIndex < 0 || fromIndex >= config.pages.length || toIndex < 0 || toIndex >= config.pages.length) {
          throw new Error(`Invalid reorder indices: ${fromIndex} -> ${toIndex}`)
        }

        const [moved] = config.pages.splice(fromIndex, 1)
        config.pages.splice(toIndex, 0, moved)

        // Update cellIndex values to reflect new order
        config.pages.forEach((page, i) => {
          if (page.cellIndex != null) page.cellIndex = i
        })
      })
  )

  // Update cell outputs
  ipcMain.handle(
    'nb:update-outputs',
    async (_event, rootPath: string, noteId: string, outputs: CellOutput[]): Promise<LoadedNotebook> =>
      updateNotebook(rootPath, (config) => {
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
      })
  )

  // Toggle cell type between markdown and code
  ipcMain.handle(
    'nb:toggle-cell-type',
    async (_event, rootPath: string, noteId: string): Promise<LoadedNotebook> =>
      updateNotebook(rootPath, async (config, root) => {
        const pending: Promise<void>[] = []

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
                // Create the code file if it doesn't exist (never truncate)
                pending.push(createContentFile(root, codeFile, ''))
              }
              return true
            }
            if (note.children && toggle(note.children)) return true
          }
          return false
        }

        toggle(config.pages)
        await Promise.all(pending)
      })
  )

  // Add a cell after a given index (for Jupyter-style notebooks)
  ipcMain.handle(
    'nb:add-cell',
    async (_event, rootPath: string, afterIndex: number, cellType: CellType): Promise<LoadedNotebook> =>
      updateNotebook(rootPath, async (config, root) => {
        const cellNum = String(config.pages.length + 1).padStart(2, '0')
        const cellId = `cell-${cellNum}`
        const mdPath = `pages/${cellId}.md`

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
          await createContentFile(root, codeFile, '')
          await createContentFile(root, mdPath, `<!-- Code Cell -->\n`)
          newNote.code = { file: codeFile, language: kc.language, execution: kc.execution }
        } else {
          await createContentFile(root, mdPath, '')
        }

        config.pages.splice(afterIndex + 1, 0, newNote)

        // Re-index cells
        config.pages.forEach((page, i) => {
          if (page.cellIndex != null) page.cellIndex = i
        })
      })
  )
}
