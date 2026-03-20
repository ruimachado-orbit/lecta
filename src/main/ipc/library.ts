import { ipcMain, app, dialog } from 'electron'
import { readFile, writeFile, mkdir, stat } from 'fs/promises'
import { join } from 'path'

// ── Types ──

export interface LibraryFolder {
  id: string
  name: string
  parentId: string | null // null = root
  color?: string
}

export interface LibraryEntry {
  id: string
  path: string
  title: string
  type: 'presentation' | 'notebook'
  folderId: string | null // null = unfiled
  tags: string[]
  createdAt: string
  updatedAt: string
  slideCount: number
  firstSlidePreview: string
}

interface LibraryData {
  folders: LibraryFolder[]
  entries: LibraryEntry[]
  tagColors?: Record<string, string>
}

// ── Persistence ──

let library: LibraryData = { folders: [], entries: [], tagColors: {} }
let libraryLoaded = false

function getLibraryPath(): string {
  return join(app.getPath('userData'), 'library.json')
}

async function loadLibrary(): Promise<LibraryData> {
  try {
    const content = await readFile(getLibraryPath(), 'utf-8')
    library = JSON.parse(content)
    if (!library.folders) library.folders = []
    if (!library.entries) library.entries = []
    if (!library.tagColors) library.tagColors = {}
  } catch {
    library = { folders: [], entries: [], tagColors: {} }
  }
  libraryLoaded = true
  return library
}

async function ensureLoaded(): Promise<void> {
  if (!libraryLoaded) await loadLibrary()
}

async function saveLibrary(): Promise<void> {
  try {
    await mkdir(app.getPath('userData'), { recursive: true })
    await writeFile(getLibraryPath(), JSON.stringify(library, null, 2))
  } catch {}
}

// ── Public: upsert from recent decks / on open ──

export async function upsertLibraryEntry(item: {
  path: string
  title: string
  type?: 'presentation' | 'notebook'
  slideCount: number
  firstSlidePreview: string
}): Promise<void> {
  await ensureLoaded()

  const existing = library.entries.find((e) => e.path === item.path)
  if (existing) {
    existing.title = item.title
    existing.slideCount = item.slideCount
    existing.firstSlidePreview = item.firstSlidePreview
    existing.updatedAt = new Date().toISOString()
  } else {
    library.entries.push({
      id: `lib-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      path: item.path,
      title: item.title,
      type: item.type || 'presentation',
      folderId: null,
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slideCount: item.slideCount,
      firstSlidePreview: item.firstSlidePreview,
    })
  }
  await saveLibrary()
}

// ── IPC Handlers ──

export function registerLibraryHandlers(): void {
  ipcMain.handle('library:get', async (): Promise<LibraryData> => {
    return loadLibrary()
  })

  // ── Folders ──

  ipcMain.handle('library:create-folder', async (_event, name: string, parentId: string | null, color?: string): Promise<LibraryFolder> => {
    await ensureLoaded()
    const folder: LibraryFolder = {
      id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      parentId: parentId || null,
      color,
    }
    library.folders.push(folder)
    await saveLibrary()
    return folder
  })

  ipcMain.handle('library:rename-folder', async (_event, folderId: string, name: string): Promise<void> => {
    await ensureLoaded()
    const folder = library.folders.find((f) => f.id === folderId)
    if (folder) folder.name = name
    await saveLibrary()
  })

  ipcMain.handle('library:delete-folder', async (_event, folderId: string): Promise<void> => {
    await ensureLoaded()
    // Move children to parent
    const folder = library.folders.find((f) => f.id === folderId)
    const parentId = folder?.parentId || null
    library.folders.filter((f) => f.parentId === folderId).forEach((f) => { f.parentId = parentId })
    library.entries.filter((e) => e.folderId === folderId).forEach((e) => { e.folderId = parentId })
    library.folders = library.folders.filter((f) => f.id !== folderId)
    await saveLibrary()
  })

  ipcMain.handle('library:set-folder-color', async (_event, folderId: string, color: string): Promise<void> => {
    await ensureLoaded()
    const folder = library.folders.find((f) => f.id === folderId)
    if (folder) folder.color = color
    await saveLibrary()
  })

  // ── Entries ──

  ipcMain.handle('library:move-entry', async (_event, entryId: string, folderId: string | null): Promise<void> => {
    await ensureLoaded()
    const entry = library.entries.find((e) => e.id === entryId)
    if (entry) entry.folderId = folderId
    await saveLibrary()
  })

  ipcMain.handle('library:set-tags', async (_event, entryId: string, tags: string[]): Promise<void> => {
    await ensureLoaded()
    const entry = library.entries.find((e) => e.id === entryId)
    if (entry) entry.tags = tags
    await saveLibrary()
  })

  ipcMain.handle('library:add-tag', async (_event, entryId: string, tag: string): Promise<void> => {
    await ensureLoaded()
    const entry = library.entries.find((e) => e.id === entryId)
    if (entry && !entry.tags.includes(tag)) {
      entry.tags.push(tag)
      await saveLibrary()
    }
  })

  ipcMain.handle('library:remove-tag', async (_event, entryId: string, tag: string): Promise<void> => {
    await ensureLoaded()
    const entry = library.entries.find((e) => e.id === entryId)
    if (entry) {
      entry.tags = entry.tags.filter((t) => t !== tag)
      await saveLibrary()
    }
  })

  ipcMain.handle('library:delete-entry', async (_event, entryId: string, deleteFile: boolean): Promise<void> => {
    await ensureLoaded()
    const entry = library.entries.find((e) => e.id === entryId)
    library.entries = library.entries.filter((e) => e.id !== entryId)
    await saveLibrary()

    if (deleteFile && entry) {
      try {
        const { rm } = await import('fs/promises')
        const s = await stat(entry.path)
        if (s.isDirectory()) {
          await rm(entry.path, { recursive: true })
        } else {
          await rm(entry.path)
        }
      } catch {}
    }
  })

  ipcMain.handle('library:rename-entry', async (_event, entryId: string, title: string): Promise<void> => {
    await ensureLoaded()
    const entry = library.entries.find((e) => e.id === entryId)
    if (entry) {
      entry.title = title
      entry.updatedAt = new Date().toISOString()
    }
    await saveLibrary()
  })

  // ── Tags ──

  ipcMain.handle('library:get-all-tags', async (): Promise<string[]> => {
    await ensureLoaded()
    const tagSet = new Set<string>()
    library.entries.forEach((e) => e.tags.forEach((t) => tagSet.add(t)))
    return Array.from(tagSet).sort()
  })

  ipcMain.handle('library:get-tag-colors', async (): Promise<Record<string, string>> => {
    await ensureLoaded()
    return library.tagColors || {}
  })

  ipcMain.handle('library:set-tag-color', async (_event, tag: string, color: string): Promise<void> => {
    await ensureLoaded()
    if (!library.tagColors) library.tagColors = {}
    library.tagColors[tag] = color
    await saveLibrary()
  })

  // ── Enhanced folder delete ──

  ipcMain.handle('library:delete-folder-with-entries', async (_event, folderId: string, deleteEntries: boolean): Promise<void> => {
    await ensureLoaded()
    if (deleteEntries) {
      // Delete all entries in this folder
      const toDelete = library.entries.filter((e) => e.folderId === folderId)
      for (const entry of toDelete) {
        try {
          const s = await stat(entry.path)
          const { rm } = await import('fs/promises')
          if (s.isDirectory()) {
            await rm(entry.path, { recursive: true })
          } else {
            await rm(entry.path)
          }
        } catch {}
      }
      library.entries = library.entries.filter((e) => e.folderId !== folderId)
    } else {
      // Move entries to root (unfiled)
      library.entries.filter((e) => e.folderId === folderId).forEach((e) => { e.folderId = null })
    }
    // Also move sub-folders to root
    library.folders.filter((f) => f.parentId === folderId).forEach((f) => { f.parentId = null })
    library.folders = library.folders.filter((f) => f.id !== folderId)
    await saveLibrary()
  })

  // ── Import .lecta files into library without opening them ──

  ipcMain.handle('library:import-lecta-files', async (): Promise<number> => {
    await ensureLoaded()
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      filters: [
        { name: 'Lecta Presentations', extensions: ['lecta'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      title: 'Import Presentations'
    })

    if (result.canceled || result.filePaths.length === 0) return 0

    let imported = 0
    for (const filePath of result.filePaths) {
      try {
        const { parsePresentationYaml } = await import('../../../packages/shared/src/utils/yaml-parser')
        const { DECK_CONFIG_FILE } = await import('../../../packages/shared/src/constants')

        let workspaceDir: string

        // Check if it's a .lecta file or a directory with lecta.yaml
        const s = await stat(filePath)
        if (s.isDirectory()) {
          // Folder — check if it has a lecta.yaml
          try {
            await stat(join(filePath, DECK_CONFIG_FILE))
            workspaceDir = filePath
          } catch {
            continue // Not a valid presentation folder
          }
        } else {
          // .lecta file — extract to workspace
          const { openLectaFile, registerWorkspace } = await import('../services/lecta-file')
          workspaceDir = await openLectaFile(filePath)
          registerWorkspace(workspaceDir, filePath)
        }

        // Read config to get metadata
        const configPath = join(workspaceDir, DECK_CONFIG_FILE)
        const yamlContent = await readFile(configPath, 'utf-8')
        const config = parsePresentationYaml(yamlContent, workspaceDir)

        const isNotebook = yamlContent.includes('type: notebook') || yamlContent.includes('type: "notebook"') || yamlContent.includes("type: 'notebook'")

        // Get first slide preview
        let preview = ''
        if (config.slides.length > 0) {
          try {
            const { resolveRelativePath } = await import('../../../packages/shared/src/utils/path-resolver')
            const mdPath = resolveRelativePath(workspaceDir, config.slides[0].content)
            const md = await readFile(mdPath, 'utf-8')
            preview = md.replace(/<!--.*?-->/gs, '').trim().split('\n').filter((l: string) => l.trim()).slice(0, 5).join('\n').slice(0, 200)
          } catch {}
        }

        await upsertLibraryEntry({
          path: workspaceDir,
          title: config.title,
          type: isNotebook ? 'notebook' : 'presentation',
          slideCount: config.slides.length,
          firstSlidePreview: preview
        })

        imported++
      } catch {
        // Skip files that fail to import
      }
    }

    return imported
  })
}
