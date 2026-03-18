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
  NoteLayout
} from '../../../packages/shared/src/types/notebook'

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
      await mkdir(join(rootPath, 'pages'), { recursive: true })
      await writeFile(join(rootPath, contentPath), '', 'utf-8')

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
            note.layout = (layout === 'blank' ? undefined : layout) as NoteLayout | undefined
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

  // Save note content (write markdown to disk + autoSave)
  ipcMain.handle(
    'nb:save-content',
    async (_event, rootPath: string, contentPath: string, content: string): Promise<void> => {
      const fullPath = join(rootPath, contentPath)
      await writeFile(fullPath, content, 'utf-8')
      await autoSave(rootPath)
    }
  )
}
